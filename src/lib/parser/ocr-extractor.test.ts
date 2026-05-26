import { describe, it, expect } from 'vitest';
import Tesseract from 'tesseract.js';
import fs from 'fs';
import path from 'path';

// Find a real uploaded image for integration testing
const STORAGE_ROOT = path.join(process.cwd(), 'data', 'storage');

function findTestImage(): string | null {
    try {
        const dirs = fs.readdirSync(STORAGE_ROOT);
        for (const dir of dirs) {
            const yearDirs = fs.readdirSync(path.join(STORAGE_ROOT, dir)).filter((d) => /^\d{4}$/.test(d));
            for (const year of yearDirs) {
                const files = fs.readdirSync(path.join(STORAGE_ROOT, dir, year));
                const img = files.find((f) => /\.(png|jpg|jpeg)$/i.test(f));
                if (img) return path.join(STORAGE_ROOT, dir, year, img);
            }
        }
    } catch {
        /* ignore */
    }
    return null;
}

describe('Tesseract.js Worker', () => {
    it('should create a worker and terminate it', async () => {
        console.log('[TEST] Creating Tesseract worker...');
        const start = Date.now();
        const worker = await Tesseract.createWorker('deu');
        const elapsed = Date.now() - start;
        console.log(`[TEST] Worker created in ${elapsed}ms`);

        expect(worker).toBeDefined();
        expect(worker.recognize).toBeDefined();
        expect(worker.terminate).toBeDefined();

        await worker.terminate();
        console.log('[TEST] Worker terminated successfully');
    }, 60_000);
});

describe('Tesseract.js recognize', () => {
    const testImagePath = findTestImage();

    it('should recognize text from a real image file', async () => {
        if (!testImagePath) {
            console.log('[TEST] No test image found in data/storage — skipping');
            return;
        }

        console.log(`[TEST] Using test image: ${testImagePath}`);
        const buffer = fs.readFileSync(testImagePath);
        console.log(`[TEST] Image size: ${(buffer.length / 1024).toFixed(0)} KB`);

        const worker = await Tesseract.createWorker('deu');
        const start = Date.now();
        const { data } = await worker.recognize(buffer);
        const elapsed = Date.now() - start;
        await worker.terminate();

        console.log(`[TEST] OCR completed in ${elapsed}ms`);
        console.log(`[TEST] Text length: ${data.text.length} chars`);
        console.log(`[TEST] Confidence: ${data.confidence.toFixed(1)}%`);
        console.log(`[TEST] First 200 chars: ${data.text.substring(0, 200)}`);

        expect(data.text.length).toBeGreaterThan(0);
        expect(data.confidence).toBeGreaterThan(0);
    }, 120_000);
});

describe('extractTextFromImage()', () => {
    const testImagePath = findTestImage();

    it('should extract text via the wrapper function', async () => {
        if (!testImagePath) {
            console.log('[TEST] No test image found — skipping');
            return;
        }

        const { extractTextFromImage } = await import('./ocr-extractor');
        const buffer = fs.readFileSync(testImagePath);

        console.log(`[TEST] Calling extractTextFromImage (${(buffer.length / 1024).toFixed(0)} KB)...`);
        const start = Date.now();
        const text = await extractTextFromImage(buffer);
        const elapsed = Date.now() - start;

        console.log(`[TEST] Completed in ${elapsed}ms, extracted ${text.length} chars`);
        console.log(`[TEST] First 300 chars: ${text.substring(0, 300)}`);

        expect(text.length).toBeGreaterThan(10);
    }, 120_000);
});
