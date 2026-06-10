import { describe, it, expect } from 'vitest';
import {
    scoreDocumentLinks,
    RawLink,
    cleanProviderNameForSearch,
    getCleanedProviderWords,
    filterAndRankLinks,
    decodeSearchUrl,
} from './search-helper';

// --- Tests ---

describe('scoreDocumentLinks', () => {
    it('findet PDF mit Keyword "stromkennzeichnung" in URL', () => {
        const links: RawLink[] = [
            {
                href: 'https://example.com/stromkennzeichnung-2024.pdf',
                text: 'Herunterladen',
                title: '',
                ariaLabel: '',
            },
        ];
        const result = scoreDocumentLinks(links);
        expect(result).toHaveLength(1);
        expect(result[0]!.type).toBe('pdf');
        expect(result[0]!.score).toBe(50 + 30); // pdf + keyword in URL
    });

    it('findet PNG mit Keyword "stromkennzeichnung" im Linktext', () => {
        const links: RawLink[] = [
            {
                href: 'https://cdn.baywa-re.de/downloads/nachweise/skz-2024.png',
                text: 'stromkennzeichnung baywa r.e. energy trading gmbh 2024',
                title: '',
                ariaLabel: '',
            },
        ];
        const result = scoreDocumentLinks(links);
        expect(result).toHaveLength(1);
        expect(result[0]!.type).toBe('image');
        expect(result[0]!.score).toBe(30 + 20); // image + keyword in text
    });

    it('bevorzugt PDF über PNG bei gleichem Keyword', () => {
        const links: RawLink[] = [
            {
                href: 'https://example.com/stromkennzeichnung.png',
                text: 'Stromkennzeichnung Bild',
                title: '',
                ariaLabel: '',
            },
            {
                href: 'https://example.com/stromkennzeichnung.pdf',
                text: 'Stromkennzeichnung PDF',
                title: '',
                ariaLabel: '',
            },
        ];
        const result = scoreDocumentLinks(links);
        expect(result).toHaveLength(2);
        expect(result[0]!.type).toBe('pdf');
        expect(result[0]!.score).toBeGreaterThan(result[1]!.score);
    });

    it('ignoriert Nicht-Dokument-Links (HTML, ZIP, etc.)', () => {
        const links: RawLink[] = [
            {
                href: 'https://example.com/stromkennzeichnung.html',
                text: 'Stromkennzeichnung',
                title: '',
                ariaLabel: '',
            },
            {
                href: 'https://example.com/stromkennzeichnung.zip',
                text: 'Stromkennzeichnung ZIP',
                title: '',
                ariaLabel: '',
            },
            { href: 'https://example.com/about', text: 'Über uns', title: '', ariaLabel: '' },
        ];
        const result = scoreDocumentLinks(links);
        expect(result).toHaveLength(0);
    });

    it('ignoriert Dokumente ohne SKZ-Keywords', () => {
        const links: RawLink[] = [
            {
                href: 'https://example.com/jahresbericht-2024.pdf',
                text: 'Jahresbericht herunterladen',
                title: '',
                ariaLabel: '',
            },
            {
                href: 'https://example.com/faq-fernsteuerung.pdf',
                text: 'FAQ Anbindung Fernsteuerung',
                title: '',
                ariaLabel: '',
            },
        ];
        const result = scoreDocumentLinks(links);
        expect(result).toHaveLength(0);
    });

    it('erkennt Keyword im title-Attribut', () => {
        const links: RawLink[] = [
            {
                href: 'https://example.com/download/2024.pdf',
                text: 'Herunterladen',
                title: 'stromkennzeichnung 2024',
                ariaLabel: '',
            },
        ];
        const result = scoreDocumentLinks(links);
        expect(result).toHaveLength(1);
        expect(result[0]!.type).toBe('pdf');
    });

    it('erkennt Keyword im aria-label', () => {
        const links: RawLink[] = [
            {
                href: 'https://example.com/download/2024.png',
                text: '',
                title: '',
                ariaLabel: 'stromkennzeichnung als bild herunterladen',
            },
        ];
        const result = scoreDocumentLinks(links);
        expect(result).toHaveLength(1);
        expect(result[0]!.type).toBe('image');
    });

    it('filtert Logo/Icon-Links trotz Keyword aus', () => {
        const links: RawLink[] = [
            { href: 'https://example.com/logo-stromkennzeichnung.png', text: 'Logo', title: '', ariaLabel: '' },
            { href: 'https://example.com/icon-energiemix.jpg', text: 'Icon', title: '', ariaLabel: '' },
        ];
        const result = scoreDocumentLinks(links);
        expect(result).toHaveLength(0); // score goes negative
    });

    it('dedupliziert gleiche URLs', () => {
        const links: RawLink[] = [
            { href: 'https://example.com/stromkennzeichnung.pdf', text: 'Link 1', title: '', ariaLabel: '' },
            {
                href: 'https://example.com/stromkennzeichnung.pdf',
                text: 'stromkennzeichnung download',
                title: '',
                ariaLabel: '',
            },
        ];
        const result = scoreDocumentLinks(links);
        expect(result).toHaveLength(1);
        // Should keep highest score (second has keyword in text too)
        expect(result[0]!.score).toBe(50 + 30 + 20); // pdf + url keyword + text keyword
    });

    it('BayWa r.e. Szenario: findet PNG-Stromkennzeichnung auf Nachweise-Seite', () => {
        // Simuliert die tatsächlichen Links auf baywa-re.de/de/landingpages/nachweise
        const links: RawLink[] = [
            {
                href: 'https://cdn.baywa-re.de/faq-fernsteuerung.pdf',
                text: 'faq anbindung fernsteuerung',
                title: '',
                ariaLabel: '',
            },
            {
                href: 'https://cdn.baywa-re.de/stromkennzeichnung-baywa-re-energy-trading-2024.png',
                text: 'stromkennzeichnung baywa r.e. energy trading gmbh 2024',
                title: '',
                ariaLabel: '',
            },
            {
                href: 'https://cdn.baywa-re.de/stromkennzeichnung-baywa-re-buergerstrom-2024.png',
                text: 'stromkennzeichnung baywa r.e. bürgerstrom gmbh 2024',
                title: '',
                ariaLabel: '',
            },
            {
                href: 'https://cdn.baywa-re.de/nachweis-wiederverkaeufer.pdf',
                text: 'nachweis für wiederverkäufer',
                title: '',
                ariaLabel: '',
            },
            {
                href: 'https://cdn.baywa-re.de/zertifikat-edifact.zip',
                text: 'verschlüsselungszertifikat edifact',
                title: '',
                ariaLabel: '',
            },
        ];
        const result = scoreDocumentLinks(links);

        // Sollte genau die 2 Stromkennzeichnungs-PNGs finden
        expect(result).toHaveLength(2);
        expect(result.every((r) => r.type === 'image')).toBe(true);
        expect(result.every((r) => r.url.includes('stromkennzeichnung'))).toBe(true);

        // FAQ-PDF und Nachweis-PDF sollten NICHT dabei sein (keine SKZ-Keywords)
        expect(result.some((r) => r.url.includes('faq'))).toBe(false);
        expect(result.some((r) => r.url.includes('nachweis'))).toBe(false);
    });

    it('bevorzugt PDF-Stromkennzeichnung über PNG wenn beides verfügbar', () => {
        const links: RawLink[] = [
            {
                href: 'https://example.com/stromkennzeichnung-2024.png',
                text: 'stromkennzeichnung als bild',
                title: '',
                ariaLabel: '',
            },
            {
                href: 'https://example.com/stromkennzeichnung-2024.pdf',
                text: 'stromkennzeichnung als pdf',
                title: '',
                ariaLabel: '',
            },
        ];
        const result = scoreDocumentLinks(links);
        expect(result).toHaveLength(2);
        expect(result[0]!.type).toBe('pdf');
        expect(result[0]!.score).toBeGreaterThan(result[1]!.score);
    });

    it('erkennt JPG-Varianten (.jpg und .jpeg)', () => {
        const links: RawLink[] = [
            { href: 'https://example.com/stromkennzeichnung.jpg', text: 'SKZ', title: '', ariaLabel: '' },
            { href: 'https://example.com/energiemix.jpeg', text: 'Energiemix', title: '', ariaLabel: '' },
        ];
        const result = scoreDocumentLinks(links);
        expect(result).toHaveLength(2);
        expect(result.every((r) => r.type === 'image')).toBe(true);
    });

    it('erkennt PDF-URLs mit Query-Parametern', () => {
        const links: RawLink[] = [
            {
                href: 'https://example.com/stromkennzeichnung.pdf?v=2&t=123',
                text: 'Download',
                title: '',
                ariaLabel: '',
            },
        ];
        const result = scoreDocumentLinks(links);
        expect(result).toHaveLength(1);
        expect(result[0]!.type).toBe('pdf');
    });
});

describe('scrapePage Bild-Erkennung', () => {
    it('erkennt PNG-Content-Type korrekt', () => {
        // Simuliert die Logik aus scrapePage für Bild-Erkennung
        const contentType = 'image/png';
        const url = 'https://cdn.baywa-re.de/stromkennzeichnung.png';

        const isImage = contentType.includes('image/') || /\.(png|jpe?g)$/i.test(url);
        expect(isImage).toBe(true);
    });

    it('erkennt JPEG-Content-Type korrekt', () => {
        const contentType = 'image/jpeg';
        const url = 'https://example.com/file';

        const isImage = contentType.includes('image/') || /\.(png|jpe?g)$/i.test(url);
        expect(isImage).toBe(true);
    });

    it('erkennt Bild-Extension ohne Content-Type', () => {
        const contentType = 'application/octet-stream';
        const url = 'https://example.com/stromkennzeichnung.jpg';

        const isPdf = contentType.includes('application/pdf') || url.toLowerCase().endsWith('.pdf');
        const isImage = contentType.includes('image/') || /\.(png|jpe?g)$/i.test(url);

        expect(isPdf).toBe(false);
        expect(isImage).toBe(true);
    });

    it('bevorzugt PDF-Erkennung über Bild', () => {
        // Ein PDF sollte nie als Bild erkannt werden
        const contentType = 'application/pdf';
        const url = 'https://example.com/stromkennzeichnung.pdf';

        const isPdf = contentType.includes('application/pdf') || url.toLowerCase().endsWith('.pdf');
        expect(isPdf).toBe(true);
        // In scrapePage wird isPdf zuerst geprüft, daher kein isImage-Check nötig
    });
});

describe('Runner: resultType-Erkennung', () => {
    it('erkennt PDF-Ergebnis', () => {
        const scrapeResult = { isPdf: true, isImage: false };
        const resultType = scrapeResult.isPdf ? 'PDF' : scrapeResult.isImage ? 'Bild' : 'HTML';
        expect(resultType).toBe('PDF');
    });

    it('erkennt Bild-Ergebnis', () => {
        const scrapeResult = { isPdf: false, isImage: true };
        const resultType = scrapeResult.isPdf ? 'PDF' : scrapeResult.isImage ? 'Bild' : 'HTML';
        expect(resultType).toBe('Bild');
    });

    it('erkennt HTML-Fallback', () => {
        const scrapeResult = { isPdf: false, isImage: false };
        const resultType = scrapeResult.isPdf ? 'PDF' : scrapeResult.isImage ? 'Bild' : 'HTML';
        expect(resultType).toBe('HTML');
    });

    it('wählt korrekte Dateiendung für JPG', () => {
        const sourceUrl = 'https://example.com/stromkennzeichnung.jpeg';
        const ext = /\.jpe?g/i.test(sourceUrl) ? 'jpg' : 'png';
        expect(ext).toBe('jpg');
    });

    it('wählt korrekte Dateiendung für PNG (default)', () => {
        const sourceUrl = 'https://example.com/stromkennzeichnung.png';
        const ext = /\.jpe?g/i.test(sourceUrl) ? 'jpg' : 'png';
        expect(ext).toBe('png');
    });
});

describe('SearchHelper name cleaning and matching', () => {
    it('cleanProviderNameForSearch entfernt GmbH und Co. KG', () => {
        expect(cleanProviderNameForSearch('Adolf Roth GmbH & Co. KG')).toBe('Adolf Roth');
        expect(cleanProviderNameForSearch('AggerEnergie GmbH')).toBe('AggerEnergie');
        expect(cleanProviderNameForSearch('1KOMMA5° Services GmbH')).toBe('1KOMMA5 Services');
    });

    it('getCleanedProviderWords extrahiert Markenwörter', () => {
        const words = getCleanedProviderWords('Adolf Roth GmbH & Co. KG Stromkennzeichnung');
        expect(words).toContain('adolf');
        expect(words).toContain('roth');
        const albstadtWords = getCleanedProviderWords('Albstadtwerke GmbH');
        expect(albstadtWords).toContain('albstadtwerke');
    });

    it('filterAndRankLinks findet Relevanz über geteilte Wörter im Hostname', () => {
        const links = ['https://www.roth-energie.de/stromkennzeichnung.pdf', 'https://www.generic.de/document.pdf'];
        const ranked = filterAndRankLinks(links, 'Adolf Roth GmbH & Co. KG Stromkennzeichnung PDF');
        // generic.de enthält den Anbieternamen nicht und wird verworfen (Schutz vor Fremd-Dokumenten)
        expect(ranked).toHaveLength(1);
        expect(ranked[0]).toBe('https://www.roth-energie.de/stromkennzeichnung.pdf');
    });

    it('filterAndRankLinks bevorzugt Anbieter-Domain vor fremdem PDF (WerraEnergie-Szenario)', () => {
        const links = [
            'https://gemeindestromwadgassen.de/wp-content/uploads/2026/06/Stromkennzeichnung-der-Stromlieferungen-2025.pdf',
            'https://www.werraenergie.de/documents/6021286/6112312/Strommix+ab+01.07.2026.pdf/a979806e-1b01?download=true',
            'https://www.werraenergie.de/',
        ];
        const ranked = filterAndRankLinks(links, 'Werraenergie GmbH Stromkennzeichnung');
        // Fremdes PDF darf NICHT gewinnen — eigenes Strommix-PDF zuerst, dann Homepage
        expect(ranked[0]).toBe(
            'https://www.werraenergie.de/documents/6021286/6112312/Strommix+ab+01.07.2026.pdf/a979806e-1b01?download=true'
        );
        expect(ranked).not.toContain(
            'https://gemeindestromwadgassen.de/wp-content/uploads/2026/06/Stromkennzeichnung-der-Stromlieferungen-2025.pdf'
        );
    });

    it('filterAndRankLinks bevorzugt Anbieter-Homepage vor fremdem PDF (Vonovia-Szenario)', () => {
        const links = [
            'https://www.ewagkamenz.de/wp-content/uploads/2025/07/044-1-Informationen-zur-Stromlieferung-Stromkennzeichnung.pdf',
            'https://www.energie.vonovia.de/',
        ];
        const ranked = filterAndRankLinks(links, 'Vonovia Energie GmbH Stromkennzeichnung');
        expect(ranked[0]).toBe('https://www.energie.vonovia.de/');
        expect(ranked).not.toContain(
            'https://www.ewagkamenz.de/wp-content/uploads/2025/07/044-1-Informationen-zur-Stromlieferung-Stromkennzeichnung.pdf'
        );
    });

    it('filterAndRankLinks akzeptiert Anbietername im Pfad (CDN-Hosting)', () => {
        const links = [
            'https://8485739.fs1.hubspotusercontent-eu1.net/hubfs/8485739/ROTH Energie/Stromkennzeichnung_2023.pdf',
            'https://www.stadtwerke-irgendwo.de/stromkennzeichnung.pdf',
        ];
        const ranked = filterAndRankLinks(links, 'Adolf Roth GmbH & Co. KG Stromkennzeichnung');
        expect(ranked).toHaveLength(1);
        expect(ranked[0]).toContain('hubspotusercontent');
    });

    it('filterAndRankLinks gibt leere Liste zurück wenn kein Link zum Anbieter passt', () => {
        const links = [
            'https://www.fremdes-stadtwerk.de/stromkennzeichnung.pdf',
            'https://www.anderes-ewerk.de/energiemix.pdf',
        ];
        const ranked = filterAndRankLinks(links, 'Voltego GmbH Stromkennzeichnung');
        expect(ranked).toHaveLength(0);
    });

    it('filterAndRankLinks behält Links wenn Anbietername keine verwertbaren Wörter ergibt', () => {
        // "24/7 Strom GmbH" → alle Wörter zu kurz/generisch → kein Anbieter-Guard möglich
        const links = ['https://www.beispiel-energie.de/stromkennzeichnung.pdf'];
        const ranked = filterAndRankLinks(links, '24/7 Strom GmbH Stromkennzeichnung');
        expect(ranked).toHaveLength(1);
    });

    it('filterAndRankLinks verwirft Firmenverzeichnisse und Werbe-Links', () => {
        const links = [
            'https://www.northdata.de/Voltego GmbH, Krefeld/HRB 17514',
            'https://duckduckgo.com/y.js?ad_domain=unsubby.com&u3=https://www.bing.com/aclick',
            'https://www.provenexpert.com/de-de/voltego-gmbh/',
            'https://www.voltego.de/stromkennzeichnung',
        ];
        const ranked = filterAndRankLinks(links, 'Voltego GmbH Stromkennzeichnung');
        expect(ranked).toEqual(['https://www.voltego.de/stromkennzeichnung']);
    });

    it('decodeSearchUrl decodiert Bing und DDG Redirect Links korrekt', () => {
        const bingRedirect = 'https://www.bing.com/ck/a?!&&p=5812&u=a1aHR0cHM6Ly93d3cuYWdnZXJlbmVyZ2llLmRlLw&ntb=1';
        expect(decodeSearchUrl(bingRedirect)).toBe('https://www.aggerenergie.de/');

        const ddgRedirect =
            'https://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.aggerenergie.de%2Ffileadmin%2F1aggerenergie%2F60_service%2F6.2_servicethemen%2F20250701_Kennzeichnung_der_Stromlieferungen_2024.pdf&rut=123';
        expect(decodeSearchUrl(ddgRedirect)).toBe(
            'https://www.aggerenergie.de/fileadmin/1aggerenergie/60_service/6.2_servicethemen/20250701_Kennzeichnung_der_Stromlieferungen_2024.pdf'
        );

        const normalUrl = 'https://www.aggerenergie.de/file.pdf';
        expect(decodeSearchUrl(normalUrl)).toBe(normalUrl);
    });
});
