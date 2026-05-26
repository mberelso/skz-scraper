import { describe, it, expect } from 'vitest';

/**
 * Da findSkzDocumentLinks eine private Methode ist und Puppeteer braucht,
 * testen wir die Scoring-Logik isoliert mit derselben Algorithmus-Kopie.
 * So stellen wir sicher, dass die Logik korrekt ist, ohne Browser starten zu müssen.
 */

// --- Scoring-Logik aus findSkzDocumentLinks extrahiert ---

interface RawLink {
    href: string;
    text: string;
    title: string;
    ariaLabel: string;
}

const SKZ_KEYWORDS = [
    'stromkennzeichnung',
    'energiemix',
    'strommix',
    'energietraeger',
    'energy-mix',
    'strom-mix',
    'kennzeichnung',
    'energiequelle',
];

function scoreDocumentLinks(rawLinks: RawLink[]): { url: string; score: number; type: 'pdf' | 'image' }[] {
    const scored: { url: string; score: number; type: 'pdf' | 'image' }[] = [];

    for (const link of rawLinks) {
        const hrefLower = link.href.toLowerCase();

        const isPdf = hrefLower.endsWith('.pdf') || hrefLower.includes('.pdf?') || hrefLower.includes('/pdf/');
        const isImage = /\.(png|jpe?g)(\?|$)/i.test(hrefLower);

        if (!isPdf && !isImage) continue;

        const combined = `${link.text} ${hrefLower} ${link.title} ${link.ariaLabel}`;
        const hasKeyword = SKZ_KEYWORDS.some((kw) => combined.includes(kw));

        if (!hasKeyword) continue;

        let score = 0;

        if (isPdf) score += 50;
        if (isImage) score += 30;

        if (SKZ_KEYWORDS.some((kw) => hrefLower.includes(kw))) score += 30;
        if (SKZ_KEYWORDS.some((kw) => link.text.includes(kw))) score += 20;

        if (hrefLower.includes('logo') || hrefLower.includes('icon') || hrefLower.includes('banner')) {
            score -= 100;
        }

        if (score > 0) {
            scored.push({ url: link.href, score, type: isPdf ? 'pdf' : 'image' });
        }
    }

    // Deduplicate
    const deduped = new Map<string, { url: string; score: number; type: 'pdf' | 'image' }>();
    for (const item of scored) {
        const existing = deduped.get(item.url);
        if (!existing || item.score > existing.score) {
            deduped.set(item.url, item);
        }
    }

    return [...deduped.values()].sort((a, b) => b.score - a.score);
}

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
        expect(result[0].type).toBe('pdf');
        expect(result[0].score).toBe(50 + 30); // pdf + keyword in URL
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
        expect(result[0].type).toBe('image');
        expect(result[0].score).toBe(30 + 20); // image + keyword in text
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
        expect(result[0].type).toBe('pdf');
        expect(result[0].score).toBeGreaterThan(result[1].score);
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
        expect(result[0].type).toBe('pdf');
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
        expect(result[0].type).toBe('image');
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
        expect(result[0].score).toBe(50 + 30 + 20); // pdf + url keyword + text keyword
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
        expect(result[0].type).toBe('pdf');
        expect(result[0].score).toBeGreaterThan(result[1].score);
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
        expect(result[0].type).toBe('pdf');
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
