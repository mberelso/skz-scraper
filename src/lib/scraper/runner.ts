import { ScraperEngine } from './engine';
import { validateAndSaveMix, updateJobLog } from './save-helper';
import { cleanProviderNameForSearch, sourceMatchesProvider } from './search-helper';
import { saveFile, slugify } from '@/lib/storage';
import { query } from '@/lib/db';
import PDFParser from 'pdf2json';
import { parseEnergyMix } from '@/lib/parser/regex-extractor';
import {
    extractEnergyMixFromPDF,
    extractEnergyMixWithAI,
    extractEnergyMixFromScreenshot,
    classifyDocument,
    DetailedEnergyMix,
} from '@/lib/parser/ai-extractor';
import { extractTextFromImage } from '@/lib/parser/ocr-extractor';
import * as cheerio from 'cheerio';

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;

export async function runScrapeJob(providerId: number, providerName: string, overwriteUrl?: string) {
    console.log(`\n=== Starting Job for: ${providerName} (ID: ${providerId}) ===`);

    // 1. Create Job Entry
    const result: any = await query('INSERT INTO scrape_jobs (provider_id, status, log_message) VALUES (?, ?, ?)', [
        providerId,
        'running',
        'Job gestartet',
    ]);
    const jobId = Number(result.insertId);

    const scraper = new ScraperEngine();

    try {
        await scraper.init();

        let scrapeResult = null;
        let lastError: Error | null = null;

        // Fetch direct URL from database if not explicitly overwritten
        let directUrl = overwriteUrl;
        if (!directUrl) {
            const providerRows: any[] = await query('SELECT skz_url, url FROM providers WHERE id = ?', [providerId]);
            if (providerRows.length > 0) {
                directUrl = providerRows[0].skz_url || providerRows[0].url;
            }
        }

        let triedDirect = false;

        // Retry loop for network errors
        for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
            try {
                if (directUrl && !triedDirect) {
                    console.log(`  [JOB] Trying direct URL: ${directUrl}`);
                    await updateJobLog(jobId, `Direkt-URL: ${directUrl}`);
                    scrapeResult = await scraper.scrapePage(directUrl);
                    triedDirect = true;
                } else {
                    // Build search query
                    const cleanName = cleanProviderNameForSearch(providerName);
                    const searchQuery = `${cleanName} Stromkennzeichnung`;
                    console.log(`  [JOB] Search query: ${searchQuery}`);
                    await updateJobLog(jobId, `Suche: ${searchQuery}`);
                    scrapeResult = await scraper.searchAndScrape(searchQuery);
                }
                break; // Success, exit retry loop
            } catch (e: any) {
                lastError = e;
                if (directUrl && !triedDirect) {
                    triedDirect = true;
                    console.warn(`  [JOB] Direct URL failed: ${e.message}. Falling back to search.`);
                }
                if (attempt <= MAX_RETRIES) {
                    console.warn(
                        `  [JOB] Attempt ${attempt} failed: ${e.message}. Retrying in ${RETRY_DELAY_MS / 1000}s...`
                    );
                    await updateJobLog(jobId, `Versuch ${attempt} fehlgeschlagen, wiederhole...`);
                    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
                }
            }
        }

        const resultType = scrapeResult
            ? scrapeResult.isPdf
                ? 'PDF'
                : scrapeResult.isImage
                  ? 'Bild'
                  : 'HTML'
            : 'Nichts';
        console.log(`  [JOB] Scrape result: ${resultType}`);

        if (!scrapeResult) {
            const errorMsg = lastError?.message || 'Keine Ergebnisse gefunden';
            await query("UPDATE scrape_jobs SET status = 'failed', log_message = ?, finished_at = NOW() WHERE id = ?", [
                errorMsg.substring(0, 255),
                jobId,
            ]);
            throw new Error(errorMsg);
        }

        const providerSlug = slugify(providerName);
        const sourceUrl = scrapeResult.sourceUrl || null;

        // Quellen-Wächter: Passt die Quelle zum Anbieter? Fremde Domains (sofern nicht
        // per trusted_sources bestätigt) werden am Mix als 'unbestaetigt' markiert und
        // der Job endet höchstens mit 'partial' — nie mit stillem 'success'.
        let sourceUnverified = sourceUrl != null && sourceMatchesProvider(sourceUrl, providerName) === false;
        if (sourceUnverified && sourceUrl) {
            try {
                const domain = new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./, '');
                const trusted: any[] = await query(
                    'SELECT 1 FROM trusted_sources WHERE provider_id = ? AND domain = ?',
                    [providerId, domain]
                );
                if (trusted.length > 0) sourceUnverified = false;
            } catch (e: any) {
                console.warn(`  [JOB] trusted_sources lookup failed: ${e.message}`);
            }
        }
        if (sourceUnverified) {
            console.warn(`  [JOB] ⚠️ Quelle passt nicht zum Anbieter: ${sourceUrl}`);
        }
        const successStatus = sourceUnverified ? 'partial' : 'success';
        const sourceNote = sourceUnverified ? ' ⚠️ Quelle unbestätigt (fremde Domain) — bitte prüfen!' : '';

        if (scrapeResult.isPdf && scrapeResult.pdfBuffer) {
            console.log(`  [JOB] PDF found (${(scrapeResult.pdfBuffer.length / 1024).toFixed(0)} KB). Saving...`);
            await updateJobLog(jobId, 'PDF gefunden, wird gespeichert...');

            // Save file first without reporting_year (we'll get it from AI extraction)
            const savedPdf = await saveFile(jobId, 'pdf', scrapeResult.pdfBuffer, 'pdf', providerSlug);

            // Extract original filename from source URL
            const originalFilename = sourceUrl
                ? decodeURIComponent(sourceUrl.split('/').pop()?.split('?')[0] || 'document.pdf')
                : 'document.pdf';

            let documentId: number | null = null;
            try {
                const docInsert: any = await query(
                    `INSERT INTO documents (job_id, provider_id, file_type, file_path, file_hash, source_url, original_filename)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [jobId, providerId, 'pdf', savedPdf.filePath, savedPdf.fileHash, sourceUrl, originalFilename]
                );
                documentId = Number(docInsert.insertId);
            } catch (e: any) {
                if (
                    e.code === 'ER_DUP_ENTRY' ||
                    e.code === '23505' ||
                    e.message?.includes('unique constraint') ||
                    e.message?.includes('duplicate key')
                ) {
                    console.warn('  [JOB] Duplicate PDF. Fetching existing document ID...');
                    const rows: any = await query('SELECT id FROM documents WHERE provider_id = ? AND file_hash = ?', [
                        providerId,
                        savedPdf.fileHash,
                    ]);
                    if (rows.length > 0) documentId = rows[0].id;
                } else {
                    throw e;
                }
            }

            if (documentId) {
                await updateJobLog(jobId, 'PDF wird analysiert...');
                const reportingYear = await parseAndSaveMix(
                    documentId,
                    scrapeResult.pdfBuffer,
                    jobId,
                    providerId,
                    sourceUnverified
                );

                // Update reporting_year on document if extracted
                if (reportingYear) {
                    await query('UPDATE documents SET reporting_year = ? WHERE id = ?', [reportingYear, documentId]);
                    await query(
                        'UPDATE scrape_jobs SET status = ?, log_message = ?, finished_at = NOW() WHERE id = ?',
                        [
                            successStatus,
                            `✅ Daten extrahiert aus PDF (Jahr: ${reportingYear}). Quelle: ${sourceUrl || 'unbekannt'}${sourceNote}`,
                            jobId,
                        ]
                    );
                } else {
                    await query(
                        "UPDATE scrape_jobs SET status = 'partial', log_message = ?, finished_at = NOW() WHERE id = ?",
                        [
                            `⚠️ PDF gespeichert, aber keine Daten extrahierbar. Quelle: ${sourceUrl || 'unbekannt'}`,
                            jobId,
                        ]
                    );
                }
            } else {
                await query(
                    "UPDATE scrape_jobs SET status = 'partial', log_message = ?, finished_at = NOW() WHERE id = ?",
                    [`⚠️ PDF gefunden aber nicht gespeichert. Quelle: ${sourceUrl || 'unbekannt'}`, jobId]
                );
            }
        } else if (scrapeResult.isImage && scrapeResult.imageBuffer) {
            // Linked image (e.g. PNG of Stromkennzeichnung) — download + analyze
            console.log(
                `  [JOB] SKZ image found (${(scrapeResult.imageBuffer.length / 1024).toFixed(0)} KB). Saving...`
            );
            await updateJobLog(jobId, 'SKZ-Bild gefunden, wird analysiert...');

            const ext = /\.jpe?g/i.test(scrapeResult.sourceUrl) ? 'jpg' : 'png';
            const savedImg = await saveFile(jobId, 'image', scrapeResult.imageBuffer, ext, providerSlug);

            const originalFilename = sourceUrl
                ? decodeURIComponent(sourceUrl.split('/').pop()?.split('?')[0] || `stromkennzeichnung.${ext}`)
                : `stromkennzeichnung.${ext}`;

            let documentId: number | null = null;
            try {
                const docInsert: any = await query(
                    `INSERT INTO documents (job_id, provider_id, file_type, file_path, file_hash, source_url, original_filename)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [jobId, providerId, 'image', savedImg.filePath, savedImg.fileHash, sourceUrl, originalFilename]
                );
                documentId = Number(docInsert.insertId);
            } catch (e: any) {
                if (
                    e.code === 'ER_DUP_ENTRY' ||
                    e.code === '23505' ||
                    e.message?.includes('unique constraint') ||
                    e.message?.includes('duplicate key')
                ) {
                    console.warn('  [JOB] Duplicate image. Fetching existing document ID...');
                    const rows: any = await query('SELECT id FROM documents WHERE provider_id = ? AND file_hash = ?', [
                        providerId,
                        savedImg.fileHash,
                    ]);
                    if (rows.length > 0) documentId = rows[0].id;
                } else {
                    throw e;
                }
            }

            if (documentId) {
                await updateJobLog(jobId, 'Bild wird durch Gemini Vision analysiert...');
                const reportingYear = await parseAndSaveMixFromImage(
                    documentId,
                    scrapeResult.imageBuffer,
                    jobId,
                    providerId,
                    sourceUnverified
                );

                if (reportingYear) {
                    await query('UPDATE documents SET reporting_year = ? WHERE id = ?', [reportingYear, documentId]);
                    await query(
                        'UPDATE scrape_jobs SET status = ?, log_message = ?, finished_at = NOW() WHERE id = ?',
                        [
                            successStatus,
                            `✅ Daten aus SKZ-Bild extrahiert (Jahr: ${reportingYear}). Quelle: ${sourceUrl || 'unbekannt'}${sourceNote}`,
                            jobId,
                        ]
                    );
                } else {
                    await query(
                        "UPDATE scrape_jobs SET status = 'partial', log_message = ?, finished_at = NOW() WHERE id = ?",
                        [
                            `⚠️ SKZ-Bild gespeichert, keine Daten extrahierbar. Quelle: ${sourceUrl || 'unbekannt'}`,
                            jobId,
                        ]
                    );
                }
            } else {
                await query(
                    "UPDATE scrape_jobs SET status = 'partial', log_message = ?, finished_at = NOW() WHERE id = ?",
                    [
                        `⚠️ SKZ-Bild gefunden aber nicht gespeichert (Duplikat?). Quelle: ${sourceUrl || 'unbekannt'}`,
                        jobId,
                    ]
                );
            }
        } else {
            // HTML page — save screenshot and try to extract data
            console.log('  [JOB] Got HTML page (no PDF). Attempting analysis...');
            await updateJobLog(jobId, 'HTML-Seite gefunden, versuche Datenextraktion...');

            const savedImg = await saveFile(jobId, 'image', scrapeResult.screenshot, 'png', providerSlug);

            const originalFilename = sourceUrl
                ? decodeURIComponent(sourceUrl.split('/').pop()?.split('?')[0] || 'screenshot.png')
                : 'screenshot.png';

            let documentId: number | null = null;
            try {
                const docInsert: any = await query(
                    `INSERT INTO documents (job_id, provider_id, file_type, file_path, file_hash, source_url, original_filename)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [jobId, providerId, 'image', savedImg.filePath, savedImg.fileHash, sourceUrl, originalFilename]
                );
                documentId = Number(docInsert.insertId);
            } catch (e: any) {
                if (
                    e.code === 'ER_DUP_ENTRY' ||
                    e.code === '23505' ||
                    e.message?.includes('unique constraint') ||
                    e.message?.includes('duplicate key')
                ) {
                    console.warn('  [JOB] Duplicate screenshot. Fetching existing document ID...');
                    const rows: any = await query('SELECT id FROM documents WHERE provider_id = ? AND file_hash = ?', [
                        providerId,
                        savedImg.fileHash,
                    ]);
                    if (rows.length > 0) documentId = rows[0].id;
                } else {
                    throw e;
                }
            }

            // Try to extract energy mix from HTML page
            if (documentId) {
                await updateJobLog(jobId, 'Analysiere HTML-Seite...');
                const reportingYear = await parseAndSaveMixFromHtml(
                    documentId,
                    scrapeResult.screenshot,
                    scrapeResult.html,
                    jobId,
                    providerId,
                    sourceUnverified
                );

                if (reportingYear) {
                    await query('UPDATE documents SET reporting_year = ? WHERE id = ?', [reportingYear, documentId]);
                    await query(
                        'UPDATE scrape_jobs SET status = ?, log_message = ?, finished_at = NOW() WHERE id = ?',
                        [successStatus, `HTML analysiert: ${sourceUrl || 'unbekannt'}${sourceNote}`, jobId]
                    );
                } else {
                    await query(
                        "UPDATE scrape_jobs SET status = 'partial', log_message = ?, finished_at = NOW() WHERE id = ?",
                        [`HTML-Seite gespeichert, keine Daten extrahierbar. Quelle: ${sourceUrl || 'unbekannt'}`, jobId]
                    );
                }
            } else {
                await query(
                    "UPDATE scrape_jobs SET status = 'partial', log_message = ?, finished_at = NOW() WHERE id = ?",
                    [`HTML-Seite gefunden, kein PDF. Quelle: ${sourceUrl || 'unbekannt'}`, jobId]
                );
            }
        }
    } catch (error: any) {
        console.error(`  [JOB] Failed: ${error.message}`);
        await query(
            "UPDATE scrape_jobs SET status = 'failed', log_message = ?, finished_at = NOW() WHERE id = ? AND status = 'running'",
            [error.message?.substring(0, 255), jobId]
        );
        throw error;
    } finally {
        await scraper.close();
    }
}

/**
 * Parse a PDF and save the extracted energy mix data.
 * Uses a cascading strategy:
 *   1. Gemini Vision API (best: can read tables, charts, layout)
 *   2. Gemini Text API (good: understands context)
 *   3. Regex extraction (basic: keyword matching)
 */
async function parseAndSaveMix(
    documentId: number,
    pdfBuffer: Buffer,
    jobId: number,
    providerId: number,
    sourceUnverified = false
): Promise<number | null> {
    let mix: DetailedEnergyMix | null = null;

    // === Strategy 1: Gemini Vision (PDF as image) ===
    if (process.env.GEMINI_API_KEY) {
        try {
            await updateJobLog(jobId, 'Gemini Vision PDF-Analyse...');
            mix = await extractEnergyMixFromPDF(pdfBuffer);
        } catch (e: any) {
            console.warn(`  [PARSE] Gemini Vision failed: ${e.message}`);
        }
    }

    // === Strategy 2: Gemini Text (extract text first, then send to AI) ===
    if (!mix && process.env.GEMINI_API_KEY) {
        try {
            console.log('  [PARSE] Vision failed. Trying Gemini text extraction...');
            await updateJobLog(jobId, 'Gemini Text-Analyse (Fallback)...');
            const rawText = await extractTextFromPdf(pdfBuffer);
            if (rawText && rawText.length > 50) {
                mix = await extractEnergyMixWithAI(rawText);
            }
        } catch (e: any) {
            console.warn(`  [PARSE] Gemini text extraction failed: ${e.message}`);
        }
    }

    // === Strategy 3: Regex (no API call needed) ===
    if (!mix) {
        try {
            console.log('  [PARSE] AI methods failed. Trying regex extraction...');
            await updateJobLog(jobId, 'Regex-Extraktion (Fallback)...');
            const rawText = await extractTextFromPdf(pdfBuffer);
            if (rawText) {
                mix = parseEnergyMix(rawText);
            }
        } catch (e: any) {
            console.warn(`  [PARSE] Regex extraction failed: ${e.message}`);
        }
    }

    // === Save result ===
    if (mix) {
        return validateAndSaveMix(mix, documentId, providerId, jobId, 'PARSE', 'Daten extrahiert', sourceUnverified);
    } else {
        console.warn('  [PARSE] ❌ No energy mix data found (all methods failed).');
        await updateJobLog(jobId, 'Keine Stromkennzeichnungsdaten extrahierbar');
    }
    return null;
}

/**
 * Extract raw text from a PDF buffer using pdf2json.
 */
async function extractTextFromPdf(buffer: Buffer): Promise<string> {
    const pdfParser = new PDFParser(null, true);
    return new Promise<string>((resolve, reject) => {
        pdfParser.on('pdfParser_dataError', (e: any) => reject(new Error(e.parserError)));
        pdfParser.on('pdfParser_dataReady', () => resolve(pdfParser.getRawTextContent()));
        pdfParser.parseBuffer(buffer);
    });
}

/**
 * Parse an HTML page and screenshot to extract energy mix data.
 * Uses a cascading strategy similar to PDF parsing:
 *   1. Gemini Vision on screenshot (best for visual data)
 *   2. Gemini Text on extracted HTML text (good for structured text)
 *   3. Regex extraction (basic keyword matching)
 */
async function parseAndSaveMixFromHtml(
    documentId: number,
    screenshotBuffer: Buffer,
    htmlContent: string,
    jobId: number,
    providerId: number,
    sourceUnverified = false
): Promise<number | null> {
    let mix: DetailedEnergyMix | null = null;

    // === Pre-filter: Classify whether this screenshot is a Stromkennzeichnung ===
    if (process.env.GEMINI_API_KEY) {
        try {
            await updateJobLog(jobId, 'Prüfe ob Screenshot eine Stromkennzeichnung enthält...');
            const classification = await classifyDocument(screenshotBuffer, 'image/png');
            if (!classification.is_skz && classification.confidence >= 70) {
                console.log(
                    `  [PARSE HTML] ⏭️ Kein SKZ-Dokument (${classification.confidence}%: ${classification.reason})`
                );
                await updateJobLog(jobId, `Kein SKZ-Dokument: ${classification.reason}`);
                return null;
            }
        } catch (e: any) {
            console.warn(`  [PARSE HTML] Classification failed, proceeding: ${e.message}`);
        }
    }

    // === Strategy 1: Gemini Vision on screenshot ===
    if (process.env.GEMINI_API_KEY) {
        try {
            await updateJobLog(jobId, 'Gemini Vision Screenshot-Analyse...');
            mix = await extractEnergyMixFromScreenshot(screenshotBuffer);
        } catch (e: any) {
            console.warn(`  [PARSE HTML] Gemini Vision screenshot failed: ${e.message}`);
        }
    }

    // === Strategy 2: Tesseract OCR on screenshot → Regex ===
    if (!mix) {
        try {
            console.log('  [PARSE HTML] Gemini Vision failed. Trying Tesseract OCR on screenshot...');
            await updateJobLog(jobId, 'Tesseract OCR Screenshot-Analyse (Fallback)...');
            const ocrText = await extractTextFromImage(screenshotBuffer);
            if (ocrText && ocrText.length > 30) {
                mix = parseEnergyMix(ocrText);
                if (mix) mix.extraction_method = 'ocr';
            }
        } catch (e: any) {
            console.warn(`  [PARSE HTML] Tesseract OCR failed: ${e.message}`);
        }
    }

    // === Strategy 3: Gemini Text on HTML text ===
    if (!mix && process.env.GEMINI_API_KEY) {
        try {
            console.log('  [PARSE HTML] OCR failed. Trying Gemini text on HTML...');
            await updateJobLog(jobId, 'Gemini Text HTML-Analyse (Fallback)...');
            const textContent = extractTextFromHtml(htmlContent);
            if (textContent && textContent.length > 100) {
                mix = await extractEnergyMixWithAI(textContent);
            }
        } catch (e: any) {
            console.warn(`  [PARSE HTML] Gemini text extraction failed: ${e.message}`);
        }
    }

    // === Strategy 4: Regex on HTML text ===
    if (!mix) {
        try {
            console.log('  [PARSE HTML] All other methods failed. Trying regex on HTML text...');
            await updateJobLog(jobId, 'Regex-Extraktion HTML (Fallback)...');
            const textContent = extractTextFromHtml(htmlContent);
            if (textContent) {
                mix = parseEnergyMix(textContent);
            }
        } catch (e: any) {
            console.warn(`  [PARSE HTML] Regex extraction failed: ${e.message}`);
        }
    }

    // === Save result ===
    if (mix) {
        return validateAndSaveMix(
            mix,
            documentId,
            providerId,
            jobId,
            'PARSE HTML',
            'HTML analysiert',
            sourceUnverified
        );
    } else {
        console.warn('  [PARSE HTML] ❌ No energy mix data found (all methods failed).');
        await updateJobLog(jobId, 'Keine Stromkennzeichnungsdaten aus HTML extrahierbar');
    }
    return null;
}

/**
 * Parse an image (PNG/JPG of Stromkennzeichnung) to extract energy mix data.
 * Uses Gemini Vision as primary method, regex on OCR text as fallback.
 */
async function parseAndSaveMixFromImage(
    documentId: number,
    imageBuffer: Buffer,
    jobId: number,
    providerId: number,
    sourceUnverified = false
): Promise<number | null> {
    let mix: DetailedEnergyMix | null = null;

    // === Pre-filter: Classify whether this image is a Stromkennzeichnung ===
    if (process.env.GEMINI_API_KEY) {
        try {
            await updateJobLog(jobId, 'Prüfe ob Bild eine Stromkennzeichnung enthält...');
            const mime = detectImageMimeFromBuffer(imageBuffer);
            const classification = await classifyDocument(imageBuffer, mime);
            if (!classification.is_skz && classification.confidence >= 70) {
                console.log(
                    `  [PARSE IMG] ⏭️ Kein SKZ-Dokument (${classification.confidence}%: ${classification.reason})`
                );
                await updateJobLog(jobId, `Kein SKZ-Dokument: ${classification.reason}`);
                return null;
            }
        } catch (e: any) {
            console.warn(`  [PARSE IMG] Classification failed, proceeding with extraction: ${e.message}`);
        }
    }

    // === Strategy 1: Gemini Vision on downloaded image ===
    if (process.env.GEMINI_API_KEY) {
        try {
            await updateJobLog(jobId, 'Gemini Vision Bild-Analyse...');
            mix = await extractEnergyMixFromScreenshot(imageBuffer);
        } catch (e: any) {
            console.warn(`  [PARSE IMG] Gemini Vision failed: ${e.message}`);
        }
    }

    // === Strategy 2: Tesseract OCR → Regex ===
    if (!mix) {
        try {
            console.log('  [PARSE IMG] Gemini failed. Trying Tesseract OCR...');
            await updateJobLog(jobId, 'Tesseract OCR Bild-Analyse (Fallback)...');
            const ocrText = await extractTextFromImage(imageBuffer);
            if (ocrText && ocrText.length > 30) {
                mix = parseEnergyMix(ocrText);
                if (mix) mix.extraction_method = 'ocr';
            }
        } catch (e: any) {
            console.warn(`  [PARSE IMG] Tesseract OCR failed: ${e.message}`);
        }
    }

    // === Save result ===
    if (mix) {
        return validateAndSaveMix(mix, documentId, providerId, jobId, 'PARSE IMG', 'Bild analysiert', sourceUnverified);
    } else {
        console.warn('  [PARSE IMG] ❌ No energy mix data found from image.');
        await updateJobLog(jobId, 'Keine Stromkennzeichnungsdaten aus Bild extrahierbar');
    }
    return null;
}

/**
 * Extract readable text from HTML using cheerio.
 * Removes scripts, styles, and cleans up whitespace.
 */
function extractTextFromHtml(html: string): string {
    const $ = cheerio.load(html);

    // Remove script and style elements
    $('script, style, noscript').remove();

    // Get text content and clean it up
    const text = $('body')
        .text()
        .replace(/\s+/g, ' ') // Normalize whitespace
        .replace(/\n+/g, '\n') // Normalize newlines
        .trim();

    return text;
}

/** Detect image MIME type from buffer magic bytes */
function detectImageMimeFromBuffer(buffer: Buffer): string {
    if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png';
    if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
    return 'image/png';
}
