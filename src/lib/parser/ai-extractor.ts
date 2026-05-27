import { GoogleGenerativeAI } from '@google/generative-ai';

let genAIInstance: GoogleGenerativeAI | null = null;
function getGenAI(): GoogleGenerativeAI {
    if (!genAIInstance) {
        genAIInstance = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    }
    return genAIInstance;
}

export interface HknOrigin {
    country: string;
    percentage: number;
}

export interface DetailedEnergyMix {
    year: number;
    // Aggregated percentages
    renewable: number;
    fossil: number;
    nuclear: number;
    // Renewable breakdown (by source)
    wind: number | null;
    solar: number | null;
    biomass: number | null;
    hydro: number | null;
    other_renewable: number | null;
    // Renewable breakdown (by funding/origin)
    eeg_funded: number | null; // EE gefördert nach EEG
    hkn: number | null; // EE mit Herkunftsnachweis, nicht EEG
    mieterstrom: number | null; // Mieterstrom gefördert nach EEG
    // Fossil breakdown
    coal: number | null;
    natural_gas: number | null;
    other_fossil: number | null;
    // Environmental impact
    co2: number;
    waste: number;
    // HKN origin countries
    hkn_origins: HknOrigin[] | null;
    // Meta
    eeg_percentage: number | null;
    tariff_name: string | null;
    confidence: number; // 0-100
    extraction_method: 'gemini_vision' | 'gemini_text' | 'regex' | 'manual' | 'ocr';
    mix_type: 'gesamtmix' | 'unternehmensmix' | 'tarifmix' | 'unbekannt' | null;
    
    // Optional extracted company info
    company_name?: string | null;
    company_address?: string | null;
    company_zip?: string | null;
    company_city?: string | null;
}

/**
 * Prompt for classifying whether a document/image is a Stromkennzeichnung.
 */
const CLASSIFICATION_PROMPT = `Analysiere dieses Dokument/Bild und bestimme, ob es eine deutsche Stromkennzeichnung (§ 42 EnWG) enthält.

Eine Stromkennzeichnung enthält TYPISCHERWEISE:
- Überschrift wie "Stromkennzeichnung", "Kennzeichnung der Stromlieferung", "Energieträgermix", "Strommix"
- Prozentangaben für Energieträger (Erneuerbare Energien, Fossile, Kernenergie)
- CO2-Emissionen in g/kWh
- Radioaktiver Abfall in g/kWh oder mg/kWh
- Oft Kreisdiagramme / Tortendiagramme mit Energieträger-Anteilen
- Verweis auf § 42 EnWG oder Energiewirtschaftsgesetz

KEINE Stromkennzeichnung sind:
- Allgemeine Firmen-Homepages oder Kontaktseiten
- Cookie-Banner oder Datenschutz-Seiten
- 404-Fehlerseiten
- Tarifrechner oder Preislisten (ohne Energieträgermix)
- Seiten die nur einen LINK zur Stromkennzeichnung enthalten, aber keine Daten zeigen

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt (kein Markdown):
{
  "is_skz": true/false,
  "confidence": 0-100,
  "reason": "kurze Begründung"
}`;

const EXTRACTION_PROMPT = `Du bist ein Experte für die Analyse von deutschen Stromkennzeichnungs-PDFs nach § 42 EnWG.
Analysiere das Dokument und extrahiere die Energie-Mix-Daten.

WICHTIG: Falls das Dokument KEINE Stromkennzeichnung enthält (z.B. eine allgemeine Homepage,
Cookie-Banner, 404-Seite, Tarifrechner ohne Mix-Daten), antworte mit:
{"is_skz": false}
Erfinde NIEMALS Daten! Nur extrahieren, was tatsächlich im Dokument steht.

SEKTIONEN — Deutsche Stromkennzeichnungen enthalten typischerweise drei Bereiche:
1. "Gesamtenergieträgermix des Unternehmens" — das ist der WICHTIGSTE, diesen extrahieren!
2. "Unternehmensverkaufsmix" oder produktspezifische Tarife
3. "Bundesmix Deutschland" — IGNORIEREN, das ist der Landesdurchschnitt!

Extrahiere IMMER den "Gesamtenergieträgermix des Unternehmens" (Sektion 1).
Falls dieser nicht vorhanden ist, nimm den "Unternehmensverkaufsmix" (Sektion 2).
NIEMALS Daten aus dem "Bundesmix Deutschland" verwenden!

ERNEUERBARE ENERGIEN — Addiere ALLE EE-Unterkategorien auf:
- "Erneuerbare Energien, gefördert nach dem EEG" (= eeg_funded)
- "Mieterstrom, gefördert nach dem EEG" (= mieterstrom)
- "Erneuerbare Energien mit Herkunftsnachweis, nicht gefördert nach dem EEG" (= ee_with_hkn)
- "Sonstige Erneuerbare Energien" (= other_renewable)
→ renewable = Summe aller EE-Kategorien

HERKUNFTSLÄNDER DER HKN (§ 42 Abs. 1 Nr. 3 EnWG):
- Viele Stromkennzeichnungen listen die Herkunftsländer der Herkunftsnachweise (HKN) auf
- z.B. "49,40 % Schweden | 24,51 % Norwegen | 10,00 % Frankreich"
- Extrahiere diese als hkn_origins Array mit Land und Prozentanteil
- Falls keine Herkunftsländer angegeben sind: hkn_origins = null

STAMMDATEN DES ANBIETERS — Versuche, den Namen und die Anschrift des Energieversorgers (aus dem Impressum, Briefkopf oder der Kennzeichnung) zu extrahieren:
- "company_name": Der offizielle Name des Anbieters (z.B. "AggerEnergie GmbH")
- "company_address": Straße und Hausnummer (z.B. "Am Panzenberg 1")
- "company_zip": 5-stellige Postleitzahl (z.B. "51643")
- "company_city": Stadt (z.B. "Gummersbach")
Falls diese Daten im Dokument absolut nicht auffindbar sind, verwende null.

REGELN:
- Suche nach dem Geltungsjahr/Berichtsjahr der Daten (meist 2022, 2023 oder 2024)
- Prozent-Angaben als Zahl ohne %-Zeichen (z.B. 45.2 statt "45,2%")
- Die Summe aus renewable + fossil + nuclear MUSS ungefähr 100% ergeben (95-105% akzeptabel)
- Verwende null für nicht vorhandene/nicht lesbare Werte
- radioactive_waste: Angabe in g/kWh (z.B. 0.0001 für "0,0001 g/kWh")
- Schätze deine Konfidenz ein (0-100): Wie sicher bist du, dass die Extraktion korrekt ist?
- Gib an, aus welcher Sektion du extrahiert hast (mix_type)

Gib das Ergebnis AUSSCHLIESSLICH als JSON-Objekt zurück (kein Markdown, keine Erklärung):
{
  "is_skz": true,
  "year": number,
  "mix_type": "gesamtmix" | "unternehmensmix" | "tarifmix" | "unbekannt",
  "renewable": number,
  "fossil": number,
  "nuclear": number,
  "wind": number | null,
  "solar": number | null,
  "biomass": number | null,
  "hydro": number | null,
  "other_renewable": number | null,
  "coal": number | null,
  "natural_gas": number | null,
  "other_fossil": number | null,
  "eeg_funded": number | null,
  "ee_with_hkn": number | null,
  "mieterstrom": number | null,
  "co2": number,
  "radioactive_waste": number,
  "eeg_percentage": number | null,
  "tariff_name": string | null,
  "confidence": number,
  "hkn_origins": [{"country": string, "percentage": number}] | null,
  "company_name": string | null,
  "company_address": string | null,
  "company_zip": string | null,
  "company_city": string | null
}`;

/**
 * Parse Gemini JSON response, handle is_skz=false, and normalize to DetailedEnergyMix.
 */
function parseGeminiResponse(
    responseText: string,
    method: DetailedEnergyMix['extraction_method']
): DetailedEnergyMix | null {
    const jsonStr = responseText.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(jsonStr);

    // Check if Gemini determined this is NOT a Stromkennzeichnung
    if (parsed.is_skz === false) {
        console.log(`  [AI] Document is NOT a Stromkennzeichnung (reason: ${parsed.reason || 'unknown'})`);
        return null;
    }

    // Map radioactive_waste → waste for backwards compatibility
    if (parsed.radioactive_waste != null && parsed.waste == null) {
        parsed.waste = parsed.radioactive_waste;
    }
    delete parsed.radioactive_waste;
    delete parsed.is_skz;

    // Map ee_with_hkn → hkn for interface consistency
    if (parsed.ee_with_hkn != null && parsed.hkn == null) {
        parsed.hkn = parsed.ee_with_hkn;
    }
    delete parsed.ee_with_hkn;

    // Ensure hkn_origins is an array or null
    if (parsed.hkn_origins && !Array.isArray(parsed.hkn_origins)) {
        parsed.hkn_origins = null;
    }

    console.log(
        `  [AI] Extraction successful (confidence: ${parsed.confidence}%, mix_type: ${parsed.mix_type || 'unbekannt'})`
    );

    return {
        ...parsed,
        extraction_method: method,
    };
}

/**
 * Helper for Gemini API calls with 429 retry logic.
 */
async function callGeminiWithRetry(fn: () => Promise<DetailedEnergyMix | null>): Promise<DetailedEnergyMix | null> {
    try {
        return await fn();
    } catch (error: any) {
        if (error.message?.includes('429') || error.message?.includes('Too Many Requests')) {
            console.warn('  [AI] Rate limit hit (429). Waiting 15s before retry...');
            await new Promise((r) => setTimeout(r, 15_000));
            try {
                return await fn();
            } catch (retryError: any) {
                console.error(`  [AI] Retry also failed: ${retryError.message}`);
                return null;
            }
        }
        console.error(`  [AI] Gemini extraction failed: ${error.message}`);
        return null;
    }
}

/**
 * Classify whether a document/image contains a Stromkennzeichnung.
 * Returns { is_skz, confidence, reason }.
 */
export async function classifyDocument(
    buffer: Buffer,
    mimeType: string
): Promise<{ is_skz: boolean; confidence: number; reason: string }> {
    if (!process.env.GEMINI_API_KEY) {
        // No API key → assume it could be SKZ (let extraction decide)
        return { is_skz: true, confidence: 0, reason: 'No API key, skipping classification' };
    }

    try {
        const model = getGenAI().getGenerativeModel({ model: 'gemini-2.5-flash' });
        const base64 = buffer.toString('base64');

        const result = await model.generateContent([
            { inlineData: { mimeType, data: base64 } },
            { text: CLASSIFICATION_PROMPT },
        ]);

        const responseText = result.response.text();
        const jsonStr = responseText.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(jsonStr);

        console.log(
            `  [AI] Classification: is_skz=${parsed.is_skz} (confidence: ${parsed.confidence}%, reason: ${parsed.reason})`
        );

        return {
            is_skz: !!parsed.is_skz,
            confidence: parsed.confidence ?? 0,
            reason: parsed.reason ?? '',
        };
    } catch (error: any) {
        if (error.message?.includes('429') || error.message?.includes('Too Many Requests')) {
            console.warn('  [AI] Classification rate-limited, assuming SKZ');
            return { is_skz: true, confidence: 0, reason: 'Rate limited, skipping classification' };
        }
        console.error(`  [AI] Classification failed: ${error.message}`);
        return { is_skz: true, confidence: 0, reason: `Error: ${error.message}` };
    }
}

/**
 * PRIMARY METHOD: Send the PDF directly to Gemini Vision for analysis.
 * This sends the raw PDF bytes as base64 inline data, so Gemini can
 * "see" the layout, tables, charts, and text together.
 */
export async function extractEnergyMixFromPDF(pdfBuffer: Buffer): Promise<DetailedEnergyMix | null> {
    if (!process.env.GEMINI_API_KEY) {
        console.warn('  [AI] GEMINI_API_KEY missing. Skipping Vision extraction.');
        return null;
    }

    return callGeminiWithRetry(async () => {
        const model = getGenAI().getGenerativeModel({ model: 'gemini-2.5-flash' });
        const base64Pdf = pdfBuffer.toString('base64');

        console.log(`  [AI] Sending PDF (${(pdfBuffer.length / 1024).toFixed(0)} KB) to Gemini Vision...`);

        const result = await model.generateContent([
            { inlineData: { mimeType: 'application/pdf', data: base64Pdf } },
            { text: EXTRACTION_PROMPT },
        ]);

        return parseGeminiResponse(result.response.text(), 'gemini_vision');
    });
}

/**
 * FALLBACK METHOD: Extract from raw text using Gemini text model.
 * Used when Vision API fails (e.g. PDF too large or corrupt).
 */
export async function extractEnergyMixWithAI(text: string): Promise<DetailedEnergyMix | null> {
    if (!process.env.GEMINI_API_KEY) {
        console.warn('  [AI] GEMINI_API_KEY is missing. Skipping AI text extraction.');
        return null;
    }

    return callGeminiWithRetry(async () => {
        const model = getGenAI().getGenerativeModel({ model: 'gemini-2.5-flash' });
        const prompt = `${EXTRACTION_PROMPT}\n\nHier ist der extrahierte Text des Dokuments:\n---\n${text.substring(0, 30000)}\n---`;

        console.log(`  [AI] Sending text (${text.length} chars) to Gemini for analysis...`);

        const result = await model.generateContent(prompt);
        return parseGeminiResponse(result.response.text(), 'gemini_text');
    });
}

/**
 * Extract energy mix from a screenshot or downloaded image using Gemini Vision.
 * Supports PNG and JPEG. Retries once on 429 (rate limit).
 */
export async function extractEnergyMixFromScreenshot(
    imageBuffer: Buffer,
    mimeType?: string
): Promise<DetailedEnergyMix | null> {
    if (!process.env.GEMINI_API_KEY) {
        console.warn('  [AI] GEMINI_API_KEY missing. Skipping screenshot analysis.');
        return null;
    }

    const detectedMime = mimeType || detectImageMime(imageBuffer);

    return callGeminiWithRetry(async () => {
        const model = getGenAI().getGenerativeModel({ model: 'gemini-2.5-flash' });
        const base64Image = imageBuffer.toString('base64');

        console.log(
            `  [AI] Sending image (${(imageBuffer.length / 1024).toFixed(0)} KB, ${detectedMime}) to Gemini Vision...`
        );

        const result = await model.generateContent([
            { inlineData: { mimeType: detectedMime, data: base64Image } },
            { text: EXTRACTION_PROMPT },
        ]);

        return parseGeminiResponse(result.response.text(), 'gemini_vision');
    });
}

/** Detect image MIME type from buffer magic bytes */
function detectImageMime(buffer: Buffer): string {
    if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png';
    if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
    return 'image/png'; // fallback
}
