import { Page } from 'puppeteer';

export interface RawLink {
    href: string;
    text: string;
    title: string;
    ariaLabel: string;
    alt?: string;
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

/**
 * Filter and rank search result links to avoid generic/irrelevant documents.
 * Returns ranked list with best matches first.
 */
export function filterAndRankLinks(links: string[], searchQuery: string): string[] {
    const blacklist = [
        'bdew.de', // BDEW Leitfaden (generic guide, not provider-specific)
        'wikipedia.org', // Encyclopedia
        'gesetze-im-internet.de', // Legal texts
        'bundesnetzagentur.de', // Regulator (generic info)
        'umweltbundesamt.de', // Environmental agency
        'energieverbraucherportal.de', // Consumer portal (generic)
    ];

    const providerName = searchQuery.split(' ')[0]?.toLowerCase() ?? '';

    const scored = links.map((url) => {
        const urlLower = url.toLowerCase();
        let score = 0;

        if (blacklist.some((domain) => urlLower.includes(domain))) {
            return { url, score: -1000 };
        }

        if (urlLower.endsWith('.pdf') || urlLower.includes('.pdf?')) {
            score += 150;
        }

        try {
            const hostname = new URL(url).hostname.toLowerCase();
            if (hostname.includes(providerName)) {
                score += 100;
            }
        } catch {
            // Invalid URL, skip
        }

        if (urlLower.includes('stromkennzeichnung') || urlLower.includes('energiemix')) {
            score += 30;
        }

        const irrelevantKeywords = [
            'leitfaden',
            'anleitung',
            'guide',
            'kontakt',
            'netznutzer',
            'mscons',
            'invoic',
            'remadv',
            'preisblatt',
            'tarif',
            'agb',
            'datenschutz',
            'impressum',
        ];
        if (irrelevantKeywords.some((kw) => urlLower.includes(kw))) {
            score -= 100;
        }

        return { url, score };
    });

    return scored
        .filter((item) => item.score > -1000)
        .sort((a, b) => b.score - a.score)
        .map((item) => item.url);
}

/**
 * Evaluates and scores links for relevance to SKZ keywords.
 * Exposed for unit tests and internal engine use.
 */
export function scoreDocumentLinks(rawLinks: RawLink[]): { url: string; score: number; type: 'pdf' | 'image' }[] {
    const scored: { url: string; score: number; type: 'pdf' | 'image' }[] = [];

    for (const link of rawLinks) {
        const hrefLower = link.href.toLowerCase();

        const isPdf = hrefLower.endsWith('.pdf') || hrefLower.includes('.pdf?') || hrefLower.includes('/pdf/');
        const isImage = /\.(png|jpe?g)(\?|$)/i.test(hrefLower);

        if (!isPdf && !isImage) continue;

        const alt = link.alt || '';
        const combined = `${link.text} ${hrefLower} ${link.title} ${link.ariaLabel} ${alt}`;
        const hasKeyword = SKZ_KEYWORDS.some((kw) => combined.includes(kw));

        if (!hasKeyword) continue;

        let score = 0;

        if (isPdf) score += 50;
        if (isImage) score += 30;

        if (SKZ_KEYWORDS.some((kw) => hrefLower.includes(kw))) score += 30;
        if (SKZ_KEYWORDS.some((kw) => link.text.includes(kw) || alt.includes(kw))) score += 20;

        if (hrefLower.includes('logo') || hrefLower.includes('icon') || hrefLower.includes('banner')) {
            score -= 100;
        }

        if (score > 0) {
            scored.push({ url: link.href, score, type: isPdf ? 'pdf' : 'image' });
        }
    }

    // Deduplicate by URL, keep highest score
    const deduped = new Map<string, { url: string; score: number; type: 'pdf' | 'image' }>();
    for (const item of scored) {
        const existing = deduped.get(item.url);
        if (!existing || item.score > existing.score) {
            deduped.set(item.url, item);
        }
    }

    return [...deduped.values()].sort((a, b) => b.score - a.score);
}

/**
 * Find document links (PDF, PNG, JPG) on an HTML page that are relevant to Stromkennzeichnung.
 * Returns scored + sorted results. PDFs rank higher than images.
 */
export async function findSkzDocumentLinks(page: Page): Promise<{ url: string; score: number; type: 'pdf' | 'image' }[]> {
    const rawLinks = await page.evaluate(() => {
        // Collect both <a> links and <img> sources
        const links = Array.from(document.querySelectorAll('a')).map((a) => ({
            href: a.href,
            text: (a.textContent || '').toLowerCase().trim(),
            title: (a.getAttribute('title') || '').toLowerCase(),
            ariaLabel: (a.getAttribute('aria-label') || '').toLowerCase(),
        }));

        const images = Array.from(document.querySelectorAll('img')).map((img) => ({
            href: img.src,
            text: '',
            title: (img.getAttribute('title') || '').toLowerCase(),
            ariaLabel: (img.getAttribute('aria-label') || '').toLowerCase(),
            alt: (img.getAttribute('alt') || '').toLowerCase(),
        }));

        return [...links, ...images].filter((link) => !!link.href && link.href.startsWith('http'));
    });

    const results = scoreDocumentLinks(rawLinks);

    if (results.length > 0) {
        console.log(`  [LINKS] Found ${results.length} relevant document link(s):`);
        for (const r of results) {
            console.log(`    ${r.type.toUpperCase()} (score ${r.score}): ${r.url}`);
        }
    }

    return results;
}
