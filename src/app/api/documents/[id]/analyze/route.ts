import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { extractEnergyMixFromPDF, extractEnergyMixFromScreenshot, classifyDocument } from '@/lib/parser/ai-extractor';
import { extractTextFromImage } from '@/lib/parser/ocr-extractor';
import { parseEnergyMix } from '@/lib/parser/regex-extractor';
import { readFile } from '@/lib/storage';

/**
 * POST /api/documents/:id/analyze
 * Re-analyze an existing document with a specific method.
 * Returns extracted data WITHOUT saving — user decides in Review form.
 *
 * Methods: 'gemini_vision' | 'tesseract_ocr' | 'classify'
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const docId = parseInt(id);
        if (isNaN(docId)) {
            return NextResponse.json({ error: 'Ungültige Dokument-ID' }, { status: 400 });
        }

        const { method } = await request.json();
        if (!method || !['gemini_vision', 'tesseract_ocr', 'classify'].includes(method)) {
            return NextResponse.json(
                { error: 'Methode muss "gemini_vision", "tesseract_ocr" oder "classify" sein' },
                { status: 400 }
            );
        }

        // Load document metadata
        const rows: any[] = await query('SELECT file_path, file_type FROM documents WHERE id = ?', [docId]);
        if (rows.length === 0) {
            return NextResponse.json({ error: 'Dokument nicht gefunden' }, { status: 404 });
        }

        const { file_path: filePath, file_type: fileType } = rows[0];

        // Read file from storage (cloud or local fallback)
        let buffer: Buffer;
        try {
            buffer = await readFile(filePath);
        } catch {
            return NextResponse.json({ error: 'Datei nicht im Speicher gefunden' }, { status: 404 });
        }

        console.log(
            `[ANALYZE] Document ${docId} (${fileType}, ${(buffer.length / 1024).toFixed(0)} KB) with method: ${method}`
        );

        // === Classify-only mode ===
        if (method === 'classify') {
            const mimeType = fileType === 'pdf' ? 'application/pdf' : detectMime(buffer);
            const classification = await classifyDocument(buffer, mimeType);
            return NextResponse.json({ success: true, ...classification });
        }

        // === Gemini Vision ===
        if (method === 'gemini_vision') {
            let result;
            if (fileType === 'pdf') {
                result = await extractEnergyMixFromPDF(buffer);
            } else {
                result = await extractEnergyMixFromScreenshot(buffer);
            }

            if (!result) {
                return NextResponse.json({
                    success: false,
                    error: 'Gemini konnte keine Stromkennzeichnungsdaten extrahieren (kein SKZ-Dokument oder keine Daten erkannt)',
                    data: null,
                });
            }

            return NextResponse.json({ success: true, data: result });
        }

        // === Tesseract OCR ===
        if (method === 'tesseract_ocr') {
            if (fileType === 'pdf') {
                return NextResponse.json({
                    success: false,
                    error: 'Tesseract OCR funktioniert nur mit Bildern, nicht mit PDFs',
                    data: null,
                });
            }

            const ocrText = await extractTextFromImage(buffer);
            if (!ocrText || ocrText.length < 20) {
                return NextResponse.json({
                    success: false,
                    error: 'OCR konnte keinen Text erkennen',
                    data: null,
                    ocrText: ocrText || '',
                });
            }

            const result = parseEnergyMix(ocrText);
            if (result) {
                result.extraction_method = 'ocr';
            }

            return NextResponse.json({
                success: !!result,
                data: result,
                ocrText,
                error: result ? undefined : 'Regex konnte aus dem OCR-Text keine Strommix-Daten extrahieren',
            });
        }

        return NextResponse.json({ error: 'Unbekannte Methode' }, { status: 400 });
    } catch (error: any) {
        console.error('[ANALYZE] Error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

function detectMime(buffer: Buffer): string {
    if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png';
    if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
    return 'image/png';
}
