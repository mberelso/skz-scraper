import puppeteer, { Browser } from 'puppeteer';
import { filterAndRankLinks, findSkzDocumentLinks } from './search-helper';

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
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
            });

            console.log(`  [SCRAPE] Navigating to ${url}...`);
            let response;
            try {
                response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
            } catch (e: any) {
                // Download links (Content-Disposition: attachment) abort navigation —
                // fetch the file directly and detect its type via magic bytes.
                if (e.message?.includes('net::ERR_ABORTED')) {
                    console.log('  [SCRAPE] Navigation aborted (Download-Link). Fetching raw buffer...');
                    const buffer = await this.downloadFile(url);
                    if (buffer && buffer.length > 4) {
                        if (buffer.subarray(0, 4).toString('latin1') === '%PDF') {
                            return {
                                html: '',
                                screenshot: Buffer.from([]),
                                pdfLinks: [],
                                pdfBuffer: buffer,
                                imageBuffer: null,
                                isPdf: true,
                                isImage: false,
                                sourceUrl: url,
                            };
                        }
                        const isPng = buffer[0] === 0x89 && buffer[1] === 0x50;
                        const isJpg = buffer[0] === 0xff && buffer[1] === 0xd8;
                        if (isPng || isJpg) {
                            return {
                                html: '',
                                screenshot: Buffer.from([]),
                                pdfLinks: [],
                                pdfBuffer: null,
                                imageBuffer: buffer,
                                isPdf: false,
                                isImage: true,
                                sourceUrl: url,
                            };
                        }
                    }
                }
                throw e;
            }

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
            const docLinks = await findSkzDocumentLinks(page);

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
     * Extract result links from a DuckDuckGo search page (html. or lite. variant).
     */
    private async extractDdgLinks(page: import('puppeteer').Page): Promise<string[]> {
        return page.evaluate(() => {
            const selectors = [
                'article a[data-testid="result-title-a"]', // Modern DDG
                'a.result__a', // Classic DDG (html.duckduckgo.com)
                'a.result-link', // DDG Lite (lite.duckduckgo.com)
                '.results a[href^="http"]', // Fallback
                '#links a[href^="http"]', // Another fallback
            ];

            for (const selector of selectors) {
                const links = Array.from(document.querySelectorAll(selector));
                const urls = links
                    .map((a) => (a as HTMLAnchorElement).href)
                    .filter((href) => {
                        if (!href || !href.startsWith('http')) return false;
                        if (href.includes('duckduckgo.com/l/?uddg=')) return true;
                        return !href.includes('duckduckgo.com');
                    });
                if (urls.length > 0) return urls;
            }
            return [];
        });
    }

    /** Check if a search page is showing a bot/captcha block */
    private async isSearchBlocked(page: import('puppeteer').Page): Promise<boolean> {
        return page.evaluate(() => {
            const text = document.body?.innerText || '';
            return text.includes('anomaly') || text.includes('captcha') || text.includes('bots use');
        });
    }

    /**
     * Search for a provider's Stromkennzeichnung.
     * Tries DuckDuckGo HTML → DuckDuckGo Lite → Bing. Each engine failure
     * (timeout, block) falls through to the next instead of aborting.
     * Throws a descriptive error when nothing usable was found, so the
     * runner's retry loop can kick in and the job log shows the real cause.
     */
    async searchAndScrape(searchQuery: string) {
        if (!this.browser) await this.init();
        const page = await this.browser!.newPage();

        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        );
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8' });
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });

        try {
            let resultLinks: string[] = [];
            const encoded = encodeURIComponent(searchQuery);

            // Strategy 1: DuckDuckGo HTML-only search
            try {
                console.log(`  [SEARCH] Searching DuckDuckGo (HTML): "${searchQuery}"`);
                await page.goto(`https://html.duckduckgo.com/html/?q=${encoded}`, {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000,
                });
                if (await this.isSearchBlocked(page)) {
                    console.warn('  [SEARCH] DuckDuckGo HTML shows bot block.');
                } else {
                    resultLinks = await this.extractDdgLinks(page);
                }
            } catch (e: any) {
                console.warn(`  [SEARCH] DuckDuckGo HTML failed: ${e.message}`);
            }

            // Strategy 2: DuckDuckGo Lite (separate endpoint, often not blocked together)
            if (resultLinks.length === 0) {
                try {
                    console.warn('  [SEARCH] Trying DuckDuckGo Lite (Fallback)...');
                    await page.goto(`https://lite.duckduckgo.com/lite/?q=${encoded}`, {
                        waitUntil: 'domcontentloaded',
                        timeout: 30000,
                    });
                    if (!(await this.isSearchBlocked(page))) {
                        resultLinks = await this.extractDdgLinks(page);
                    }
                } catch (e: any) {
                    console.warn(`  [SEARCH] DuckDuckGo Lite failed: ${e.message}`);
                }
            }

            // Strategy 3: Bing
            if (resultLinks.length === 0) {
                try {
                    console.warn('  [SEARCH] Trying Bing Search (Fallback)...');
                    await page.goto(`https://www.bing.com/search?q=${encoded}`, {
                        waitUntil: 'domcontentloaded',
                        timeout: 30000,
                    });
                    resultLinks = await page.evaluate(() => {
                        const links = Array.from(document.querySelectorAll('ol#b_results li.b_algo h2 a'));
                        return links
                            .map((a) => (a as HTMLAnchorElement).href)
                            .filter((href) => {
                                if (!href || !href.startsWith('http')) return false;
                                if (href.includes('bing.com')) {
                                    return href.includes('/ck/a');
                                }
                                return true;
                            });
                    });
                } catch (e: any) {
                    console.warn(`  [SEARCH] Bing failed: ${e.message}`);
                }
            }

            if (resultLinks.length === 0) {
                throw new Error('Suchmaschinen nicht erreichbar oder blockiert (DuckDuckGo + Bing ohne Ergebnisse)');
            }

            // Filter and rank search results
            const filteredLinks = filterAndRankLinks(resultLinks, searchQuery);
            console.log(`  [SEARCH] Raw links found:`, resultLinks);
            console.log(`  [SEARCH] Scored and ranked links:`, filteredLinks);

            const targetLink = filteredLinks[0];
            if (!targetLink) {
                throw new Error('Keine zum Anbieter passenden Suchergebnisse (nur fremde/generische Treffer)');
            }
            console.log(`  [SEARCH] Target URL: ${targetLink}`);

            await page.close();
            return await this.scrapePage(targetLink);
        } catch (e: any) {
            console.error('  [SEARCH] searchAndScrape failed:', e.message);
            if (!page.isClosed()) await page.close();
            throw e;
        }
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
}
