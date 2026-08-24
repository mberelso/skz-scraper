import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { normalize } from './helpers/normalize';

const GOLDEN_ROOT = __dirname;
const TEXT_DIR = join(GOLDEN_ROOT, 'fixtures/text');
const MOCK_DIR = join(GOLDEN_ROOT, 'fixtures/mock-responses');
const EXPECTED_DIR = join(GOLDEN_ROOT, 'expected');
const UPDATE_GOLDEN = process.env.UPDATE_GOLDEN === '1';

const ids = existsSync(TEXT_DIR)
    ? readdirSync(TEXT_DIR)
          .filter((f) => f.endsWith('.txt'))
          .map((f) => f.replace(/\.txt$/, ''))
    : [];

describe('Golden-File Text Tests', () => {
    if (ids.length === 0) {
        it.skip('Keine Fixtures gefunden', () => {});
        return;
    }

    it.each(ids)('prüft Extraktionsergebnis für Fixture "%s"', (id) => {
        const textPath = join(TEXT_DIR, `${id}.txt`);
        const mockPath = join(MOCK_DIR, `${id}.json`);
        const expectedPath = join(EXPECTED_DIR, `${id}.json`);

        expect(existsSync(textPath)).toBe(true);
        expect(existsSync(mockPath)).toBe(true);

        const mockResponseRaw = JSON.parse(readFileSync(mockPath, 'utf8'));
        const contentStr = mockResponseRaw.choices[0].message.content;
        const parsed = JSON.parse(contentStr);

        // Normalize radioactive_waste / waste and ee_with_hkn / hkn
        if (parsed.radioactive_waste != null && parsed.waste == null) {
            parsed.waste = parsed.radioactive_waste;
        }
        delete parsed.radioactive_waste;
        if (parsed.ee_with_hkn != null && parsed.hkn == null) {
            parsed.hkn = parsed.ee_with_hkn;
        }
        delete parsed.ee_with_hkn;
        delete parsed.is_skz;

        const normalizedActual = normalize(parsed);

        if (UPDATE_GOLDEN || !existsSync(expectedPath)) {
            writeFileSync(expectedPath, JSON.stringify(normalizedActual, null, 2) + '\n');
            console.log(`[Golden Test] Golden File geschrieben für ${id}`);
            return;
        }

        const expected = JSON.parse(readFileSync(expectedPath, 'utf8'));
        expect(normalizedActual).toEqual(expected);
    });
});
