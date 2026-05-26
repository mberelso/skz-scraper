import Tesseract from 'tesseract.js';

const OCR_TIMEOUT_MS = 90_000; // 90 seconds max (includes model download on first run)

/**
 * Extract text from an image buffer using Tesseract OCR.
 * Uses German language model for best results on Stromkennzeichnung documents.
 * Creates a fresh worker each time to avoid issues with Next.js/Turbopack.
 */
export async function extractTextFromImage(imageBuffer: Buffer): Promise<string> {
    let worker: Tesseract.Worker | null = null;

    const result = await Promise.race([
        (async () => {
            console.log('  [OCR] Creating Tesseract worker (deu)...');
            worker = await Tesseract.createWorker('deu', undefined, {
                logger: (m) => {
                    if (m.status === 'loading tesseract core' || m.status === 'loading language traineddata') {
                        console.log(`  [OCR] ${m.status}: ${(m.progress * 100).toFixed(0)}%`);
                    }
                },
            });
            console.log('  [OCR] Worker ready, recognizing...');
            const { data } = await worker.recognize(imageBuffer);
            console.log(`  [OCR] Extracted ${data.text.length} chars (confidence: ${data.confidence.toFixed(0)}%)`);
            return data.text;
        })(),
        new Promise<never>((_, reject) =>
            setTimeout(
                () => reject(new Error('OCR Timeout (90s) — Tesseract konnte nicht initialisiert werden')),
                OCR_TIMEOUT_MS
            )
        ),
    ]).finally(async () => {
        if (worker) {
            try {
                await worker.terminate();
                console.log('  [OCR] Worker terminated.');
            } catch {
                /* ignore */
            }
        }
    });

    return result;
}
