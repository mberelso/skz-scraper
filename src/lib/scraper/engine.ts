import puppeteer, { Browser, Page } from 'puppeteer';

export class ScraperEngine {
    private browser: Browser | null = null;
    private scrapeCount = 0;
    private readonly MAX_SCRAPES_PER_BROWSER = 20; // Restart browser after N scrapes to prevent memory leaks

    async init() {
        if (!this.browser) {
            this.browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
            });
            this.scrapeCount = 0;
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.scrapeCount = 0;
        }
    }

    /**
     * Restart browser if scrape count exceeds threshold (prevents memory leaks in long-running batch jobs)
     */
    private async maybeRestartBrowser() {
        if (this.scrapeCount >= this.MAX_SCRAPES_PER_BROWSER) {
            console.log(`  [BROWSER] Restarting after ${this.scrapeCount} scrapes (memory leak prevention)`);
            await this.close();
            await this.init();
        }
    }

    /**
     * Scrape a specific page URL. If it's a PDF, download it directly.
     * If it's HTML, look for document links (PDF, PNG, JPG) related to Stromkennzeichnung.
     */
    async scrapePage(url: string): Promise<{
        html: string;
        screenshot: Buffer;
        pdfLinks: string[];
        pdfBuffer: Buffer | null;
        imageBuffer: Buffer | null;
        isPdf: boolean;
        isImage: boolean;
        sourceUrl: string;
    } | null> {
        if (!this.browser) await this.init();
        await this.maybeRestartBrowser();
        this.scrapeCount++;

        const page = await this.browser!.newPage();
        try {
            await page.setViewport({ width: 1280, height: 800 });
            await page.setUserAgent(
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            );

            console.log(`  [SCRAPE] Navigating to ${url}...`);
            const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

            if (!response) {
                throw new Error('No response received from ' + url);
            }

            const contentType = response.headers()['content-type'] || '';

            // PDF detected — fetch raw bytes separately
            if (contentType.includes('application/pdf') || url.toLowerCase().endsWith('.pdf')) {
                console.log('  [SCRAPE] PDF detected. Fetching raw buffer...');
                const pdfBuffer = await this.downloadPdf(url);
                if (!pdfBuffer) throw new Error('PDF download failed');
                return {
                    html: '',
                    screenshot: Buffer.from([]),
                    pdfLinks: [],
                    pdfBuffer,
                    imageBuffer: null,
                    isPdf: true,
                    isImage: false,
                    sourceUrl: url,
                };
            }

            // Image detected (direct link to PNG/JPG)
            if (contentType.includes('image/') || /\.(png|jpe?g)$/i.test(url)) {
                console.log('  [SCRAPE] Image detected. Fetching raw buffer...');
                const imageBuffer = await this.downloadFile(url);
                if (!imageBuffer) throw new Error('Image download failed');
                return {
                    html: '',
                    screenshot: Buffer.from([]),
                    pdfLinks: [],
                    pdfBuffer: null,
                    imageBuffer,
                    isPdf: false,
                    isImage: true,
                    sourceUrl: url,
                };
            }

            // HTML page — look for document links (PDF + images) containing SKZ keywords
            const docLinks = await this.findSkzDocumentLinks(page);

            // If there are relevant document links, follow the best one
            if (docLinks.length > 0) {
                const best = docLinks[0];
                if (best) {
                    console.log(
                        `  [SCRAPE] Found ${docLinks.length} relevant document link(s). Following best: ${best.url} (score: ${best.score}, type: ${best.type})`
                    );
                    await page.close();
                    return await this.scrapePage(best.url);
                }
            }

            // No documents found — save HTML + screenshot
            const html = await page.content();
            const screenshot = await page.screenshot({ fullPage: true });

            return {
                html,
                screenshot: Buffer.from(screenshot),
                pdfLinks: [],
                pdfBuffer: null,
                imageBuffer: null,
                isPdf: false,
                isImage: false,
                sourceUrl: url,
            };
        } finally {
            if (!page.isClosed()) await page.close();
        }
    }

    /**
     * Search DuckDuckGo for a provider's Stromkennzeichnung.
     * DuckDuckGo has much less anti-bot protection than Google.
     */
    async searchAndScrape(searchQuery: string) {
        if (!this.browser) await this.init();
        const page = await this.browser!.newPage();

        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        );
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8' });

        try {
            // Strategy 1: DuckDuckGo search
            const ddgUrl = 'https://duckduckgo.com/?q=' + encodeURIComponent(searchQuery) + '&kl=de-de';
            console.log(`  [SEARCH] Searching DuckDuckGo: "${searchQuery}"`);
            await page.goto(ddgUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // Wait for results to load (DuckDuckGo uses JavaScript rendering)
            await new Promise((r) => setTimeout(r, 3000));

            // Extract search result links
            const resultLinks = await page.evaluate(() => {
                // DuckDuckGo result links (multiple possible selectors for robustness)
                const selectors = [
                    'article a[data-testid="result-title-a"]', // Modern DDG
                    'a.result__a', // Classic DDG
                    '.results a[href^="http"]', // Fallback
                    '#links a[href^="http"]', // Another fallback
                ];

                for (const selector of selectors) {
                    const links = Array.from(document.querySelectorAll(selector));
                    const urls = links
                        .map((a) => (a as HTMLAnchorElement).href)
                        .filter((href) => href && href.startsWith('http') && !href.includes('duckduckgo.com'));
                    if (urls.length > 0) return urls;
                }
                return [];
            });

            if (resultLinks.length === 0) {
                console.warn('  [SEARCH] No DuckDuckGo results found. Page may require JS or layout changed.');
                // Try to get any clickable links as last resort
                const anyLinks = await page.evaluate(() =>
                    Array.from(document.querySelectorAll('a[href^="http"]'))
                        .map((a) => (a as HTMLAnchorElement).href)
                        .filter((href) => !href.includes('duckduckgo.com') && !href.includes('duck.co'))
                );
                if (anyLinks.length === 0) {
                    console.error('  [SEARCH] No links found at all on DuckDuckGo page.');
                    return null;
                }
                // Use best fallback link
                const fallbackLink = anyLinks[0];
                if (fallbackLink) {
                    console.log(`  [SEARCH] Found ${anyLinks.length} fallback link(s). Using: ${fallbackLink}`);
                    await page.close();
                    return await this.scrapePage(fallbackLink);
                }
            }

            // Filter and rank search results
            const filteredLinks = this.filterAndRankLinks(resultLinks, searchQuery);

            if (filteredLinks.length === 0) {
                console.error('  [SEARCH] All results were filtered out (likely generic/irrelevant).');
                await page.close();
                return null;
            }

            const targetLink = filteredLinks[0];
            if (!targetLink) {
                console.error('  [SEARCH] No target link found after filtering.');
                await page.close();
                return null;
            }
            console.log(`  [SEARCH] Found ${resultLinks.length} result(s), ${filteredLinks.length} after filtering.`);
            console.log(`  [SEARCH] Target URL: ${targetLink}`);

            await page.close();
            return await this.scrapePage(targetLink);
        } catch (e: any) {
            console.error('  [SEARCH] searchAndScrape failed:', e.message);
            if (!page.isClosed()) await page.close();
            return null;
        }
    }

    /**
     * Filter and rank search result links to avoid generic/irrelevant documents.
     * Returns ranked list with best matches first.
     */
    private filterAndRankLinks(links: string[], searchQuery: string): string[] {
        // Blacklist: Known generic/irrelevant domains
        const blacklist = [
            'bdew.de', // BDEW Leitfaden (generic guide, not provider-specific)
            'wikipedia.org', // Encyclopedia
            'gesetze-im-internet.de', // Legal texts
            'bundesnetzagentur.de', // Regulator (generic info)
            'umweltbundesamt.de', // Environmental agency
            'energieverbraucherportal.de', // Consumer portal (generic)
        ];

        // Extract provider name from search query
        const providerName = searchQuery.split(' ')[0]?.toLowerCase() ?? ''; // First word is usually provider name

        // Score each link
        const scored = links.map((url) => {
            const urlLower = url.toLowerCase();
            let score = 0;

            // Blacklist check (-1000 points = effectively excluded)
            if (blacklist.some((domain) => urlLower.includes(domain))) {
                console.log(`  [FILTER] ❌ Blacklisted: ${url}`);
                return { url, score: -1000 };
            }

            // Strongly prefer direct PDF links (+150 points)
            if (urlLower.endsWith('.pdf') || urlLower.includes('.pdf?')) {
                score += 150;
                console.log(`  [FILTER] 📄 Direct PDF link: ${url}`);
            }

            // Prefer URLs containing provider name in domain (+100 points)
            try {
                const hostname = new URL(url).hostname.toLowerCase();
                if (hostname.includes(providerName)) {
                    score += 100;
                    console.log(`  [FILTER] ✅ Provider domain match: ${url}`);
                }
            } catch {
                // Invalid URL, skip
            }

            // Prefer URLs with "stromkennzeichnung" or "energiemix" (+30 points)
            if (urlLower.includes('stromkennzeichnung') || urlLower.includes('energiemix')) {
                score += 30;
            }

            // Penalize irrelevant documents (-100 points)
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
                console.log(`  [FILTER] ⚠️  Irrelevant keyword in: ${url}`);
            }

            return { url, score };
        });

        // Filter out blacklisted and sort by score
        const filtered = scored
            .filter((item) => item.score > -1000)
            .sort((a, b) => b.score - a.score)
            .map((item) => item.url);

        console.log(`  [FILTER] Filtered ${links.length} → ${filtered.length} links`);
        return filtered;
    }

    /** Max file size: 20 MB */
    private static MAX_FILE_SIZE = 20 * 1024 * 1024;

    /**
     * Download a file (PDF, image, etc.) by URL and return the raw buffer.
     * Rejects files larger than MAX_FILE_SIZE.
     */
    private async downloadFile(url: string): Promise<Buffer | null> {
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                },
                signal: AbortSignal.timeout(30_000),
            });
            if (!response.ok) {
                console.error(`  [DOWNLOAD] Failed: HTTP ${response.status} for ${url}`);
                return null;
            }

            // Check Content-Length header before downloading
            const contentLength = parseInt(response.headers.get('content-length') || '0');
            if (contentLength > ScraperEngine.MAX_FILE_SIZE) {
                console.error(
                    `  [DOWNLOAD] File too large: ${(contentLength / 1024 / 1024).toFixed(1)} MB (max ${ScraperEngine.MAX_FILE_SIZE / 1024 / 1024} MB)`
                );
                return null;
            }

            const arrayBuffer = await response.arrayBuffer();

            // Double-check actual size
            if (arrayBuffer.byteLength > ScraperEngine.MAX_FILE_SIZE) {
                console.error(
                    `  [DOWNLOAD] Downloaded file too large: ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)} MB`
                );
                return null;
            }

            return Buffer.from(arrayBuffer);
        } catch (e: any) {
            console.error(`  [DOWNLOAD] Error: ${e.message}`);
            return null;
        }
    }

    /** Alias for backward compat */
    private async downloadPdf(url: string): Promise<Buffer | null> {
        return this.downloadFile(url);
    }

    /**
     * Find document links (PDF, PNG, JPG) on an HTML page that are relevant to Stromkennzeichnung.
     * Returns scored + sorted results. PDFs rank higher than images.
     */
    private async findSkzDocumentLinks(page: Page): Promise<{ url: string; score: number; type: 'pdf' | 'image' }[]> {
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

        const scored: { url: string; score: number; type: 'pdf' | 'image' }[] = [];

        for (const link of rawLinks) {
            const hrefLower = link.href.toLowerCase();

            // Determine file type
            const isPdf = hrefLower.endsWith('.pdf') || hrefLower.includes('.pdf?') || hrefLower.includes('/pdf/');
            const isImage = /\.(png|jpe?g)(\?|$)/i.test(hrefLower);

            if (!isPdf && !isImage) continue;

            // Check keyword relevance in text, URL, title, aria-label, alt
            const alt = (link as any).alt || '';
            const combined = `${link.text} ${hrefLower} ${link.title} ${link.ariaLabel} ${alt}`;
            const hasKeyword = SKZ_KEYWORDS.some((kw) => combined.includes(kw));

            if (!hasKeyword) continue;

            let score = 0;

            // File type scoring: PDF preferred over image
            if (isPdf) score += 50;
            if (isImage) score += 30;

            // Keyword in filename/URL is stronger signal
            if (SKZ_KEYWORDS.some((kw) => hrefLower.includes(kw))) score += 30;

            // Keyword in link text/alt is also strong
            if (SKZ_KEYWORDS.some((kw) => link.text.includes(kw) || alt.includes(kw))) score += 20;

            // Penalize generic/unrelated filenames
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

        const results = [...deduped.values()].sort((a, b) => b.score - a.score);

        if (results.length > 0) {
            console.log(`  [LINKS] Found ${results.length} relevant document link(s):`);
            for (const r of results) {
                console.log(`    ${r.type.toUpperCase()} (score ${r.score}): ${r.url}`);
            }
        }

        return results;
    }
}
