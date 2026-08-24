import { describe, it, expect } from 'vitest';
import { categorizeFailure } from './failure-triage';
import { sourceMatchesProvider } from './scraper/search-helper';

describe('categorizeFailure', () => {
    it('erkennt Suchmaschinen-Blockade', () => {
        expect(
            categorizeFailure('Suchmaschinen nicht erreichbar oder blockiert (DuckDuckGo + Bing ohne Ergebnisse)')
        ).toBe('suchmaschine_blockiert');
    });

    it('erkennt fehlende Treffer', () => {
        expect(categorizeFailure('Keine Ergebnisse gefunden')).toBe('kein_treffer');
        expect(categorizeFailure('Keine zum Anbieter passenden Suchergebnisse (nur fremde/generische Treffer)')).toBe(
            'kein_treffer'
        );
    });

    it('erkennt Timeout', () => {
        expect(categorizeFailure('Timeout nach 2 Min.')).toBe('timeout');
    });

    it('erkennt Duplikat-Konflikte', () => {
        expect(categorizeFailure('duplicate key value violates unique constraint "documents_file_hash_key"')).toBe(
            'duplikat'
        );
    });

    it('erkennt Batch-Abbruch', () => {
        expect(categorizeFailure('Job gestartet | Abgebrochen (Batch-Start)')).toBe('abgebrochen');
    });

    it('erkennt Bereinigung', () => {
        expect(categorizeFailure('Bereinigt: Dokument stammte von fremdem Anbieter (https://x.de)')).toBe('bereinigt');
    });

    it('fällt auf sonstige zurück', () => {
        expect(categorizeFailure('net::ERR_NAME_NOT_RESOLVED at https://x.de')).toBe('sonstige');
        expect(categorizeFailure(null)).toBe('sonstige');
    });
});

describe('sourceMatchesProvider (Quellen-Wächter)', () => {
    it('akzeptiert die eigene Domain', () => {
        expect(sourceMatchesProvider('https://www.werraenergie.de/strommix.pdf', 'Werraenergie GmbH')).toBe(true);
    });

    it('akzeptiert Anbieternamen im Pfad (CDN)', () => {
        expect(
            sourceMatchesProvider('https://cdn.hubspot.net/hubfs/ROTH%20Energie/skz.pdf', 'Adolf Roth GmbH & Co. KG')
        ).toBe(true);
    });

    it('meldet fremde Domains', () => {
        expect(sourceMatchesProvider('https://www.rwe.com/skz-2024.pdf', 'Arndt Solarenergie UG')).toBe(false);
    });

    it('gibt null zurück wenn Name keine verwertbaren Wörter ergibt', () => {
        expect(sourceMatchesProvider('https://www.suec.de/skz.pdf', '24/7 Strom GmbH')).toBe(null);
    });

    it('gibt null zurück bei ungültiger URL', () => {
        expect(sourceMatchesProvider('kein-url', 'Werraenergie GmbH')).toBe(null);
    });
});
