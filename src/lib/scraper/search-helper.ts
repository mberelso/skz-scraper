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
 * Decodes a Bing redirect URL if it is one, returning the direct target URL.
 */
export function decodeSearchUrl(url: string): string {
    if (url.includes('bing.com/ck/a')) {
        try {
            const urlObj = new URL(url);
            const u = urlObj.searchParams.get('u');
            if (u && u.startsWith('a1')) {
                const base64Part = u.substring(2);
                // Standard base64 decoding in Node.js
                const decoded = Buffer.from(base64Part, 'base64').toString('utf8');
                if (decoded.startsWith('http')) {
                    return decoded;
                }
            }
        } catch (e) {
            // Ignore decoding failure, return original
        }
    }
    if (url.includes('duckduckgo.com/l/?uddg=')) {
        try {
            const urlObj = new URL(url);
            const uddg = urlObj.searchParams.get('uddg');
            if (uddg) {
                return decodeURIComponent(uddg);
            }
        } catch (e) {
            // Ignore decoding failure, return original
        }
    }
    return url;
}

/**
 * Clean a provider name to remove corporate suffixes (GmbH, AG, etc.) for a cleaner search query.
 */
export function cleanProviderNameForSearch(name: string): string {
    return name
        .replace(/\b(gmbh & co\.?\s*kg|gmbh & co\.?\s*ohg|gmbh|co\.?\s*kg|ag|eg|ug|se)\b/gi, '')
        .replace(/[^a-zA-Z0-9äöüÄÖÜß\s\-&]/g, '') // Remove special chars except spaces, hyphens, and ampersands
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Extract meaningful words from a search query to match against hostnames.
 */
export function getCleanedProviderWords(searchQuery: string): string[] {
    let clean = searchQuery.toLowerCase();

    // Remove search keywords
    for (const kw of SKZ_KEYWORDS) {
        clean = clean.replace(new RegExp(`\\b${kw}\\b`, 'g'), '');
    }
    clean = clean.replace(/\bpdf\b/g, '');

    // Remove corporate suffixes and generic words
    const suffixes = [
        'gmbh & co\\.? kg',
        'gmbh & co\\.? ohg',
        'gmbh',
        'co\\.? kg',
        'ag',
        'eg',
        'ug',
        'se',
        'solutions',
        'service',
        'services',
        'energy',
        'energie',
        'strom',
        'gas',
        'versorgung',
        'stadtwerke',
        'stadtwerk',
        'werke',
        'werk',
        'holding',
        'deutschland',
    ];
    for (const suffix of suffixes) {
        clean = clean.replace(new RegExp(`\\b${suffix}\\b`, 'g'), '');
    }

    // Split and extract words with length > 2
    return clean
        .split(/[\s,.\-\/&\(\)]+/)
        .map((w) => w.replace(/[^a-z0-9äöüß]/g, '').trim())
        .filter((w) => w.length > 2);
}

/**
 * Filter and rank search result links to avoid generic/irrelevant documents.
 * Returns ranked list with best matches first.
 *
 * Wichtig: Treffer auf der Domain des Anbieters wiegen deutlich schwerer als
 * fremde PDFs, sonst wird die Stromkennzeichnung eines ANDEREN Versorgers
 * gespeichert (z.B. fremdes Stadtwerk-PDF rankt vor der Anbieter-Homepage).
 * Wenn der Anbietername in keinem Link vorkommt, wird lieber gar nichts
 * zurückgegeben als ein fremdes Dokument.
 */
export function filterAndRankLinks(links: string[], searchQuery: string): string[] {
    const blacklist = [
        'bdew.de', // BDEW Leitfaden (generic guide, not provider-specific)
        'wikipedia.org', // Encyclopedia
        'gesetze-im-internet.de', // Legal texts
        'bundesnetzagentur.de', // Regulator (generic info)
        'umweltbundesamt.de', // Environmental agency
        'energieverbraucherportal.de', // Consumer portal (generic)
        'duckduckgo.com', // Search engine ads/redirects (y.js)
        'bing.com', // Search engine ads
        'apps.apple.com', // App stores
        'play.google.com',
        'northdata.de', // Company registers / business directories
        'creditreform.de',
        'insolvenz-radar.de',
        'provenexpert.com', // Review/PR portals
        'firmenpresse.de',
        'fair-news.de',
        'linkedin.com',
        'xing.com',
        'facebook.com',
        'instagram.com',
        'youtube.com',
    ];

    const cleanedWords = getCleanedProviderWords(searchQuery);

    // Decode any redirect URLs (e.g. from Bing)
    const decodedLinks = links.map(decodeSearchUrl);

    const scored = decodedLinks.map((url) => {
        const urlLower = url.toLowerCase();
        let score = 0;
        let matchesProvider = false;

        if (blacklist.some((domain) => urlLower.includes(domain))) {
            return { url, score: -1000, matchesProvider };
        }

        // PDF detection incl. paths like "/Strommix.pdf/uuid?download=true"
        if (/\.pdf($|[?#\/])/.test(urlLower)) {
            score += 100;
        }

        try {
            const parsed = new URL(url);
            const hostname = parsed.hostname.toLowerCase();
            const pathAndQuery = (parsed.pathname + parsed.search).toLowerCase();

            // Provider name in hostname = strongest signal (own website)
            if (cleanedWords.some((word) => hostname.includes(word))) {
                score += 400;
                matchesProvider = true;
            } else if (cleanedWords.some((word) => pathAndQuery.includes(word))) {
                // Provider name in path (e.g. doc hosted on a CDN)
                score += 150;
                matchesProvider = true;
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

        return { url, score, matchesProvider };
    });

    let candidates = scored.filter((item) => item.score > -1000);

    // Guard against wrong-provider documents: if we know the provider's name words,
    // only accept links that actually reference the provider (hostname or path).
    if (cleanedWords.length > 0) {
        candidates = candidates.filter((item) => item.matchesProvider);
    }

    return candidates.sort((a, b) => b.score - a.score).map((item) => item.url);
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
export async function findSkzDocumentLinks(
    page: Page
): Promise<{ url: string; score: number; type: 'pdf' | 'image' }[]> {
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
