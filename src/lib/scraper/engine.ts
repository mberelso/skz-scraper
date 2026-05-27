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
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });

        try {
            // Strategy 1: DuckDuckGo HTML-only search
            const ddgUrl = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(searchQuery);
            console.log(`  [SEARCH] Searching DuckDuckGo (HTML): "${searchQuery}"`);
            await page.goto(ddgUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // Extract search result links
            let resultLinks = await page.evaluate(() => {
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
                        .filter((href) => {
                            if (!href || !href.startsWith('http')) return false;
                            if (href.includes('duckduckgo.com/l/?uddg=')) return true;
                            return !href.includes('duckduckgo.com');
                        });
                    if (urls.length > 0) return urls;
                }
                return [];
            });

            // Check if DDG is showing bot anomaly block
            const isBlocked = await page.evaluate(() => {
                const text = document.body.innerText || '';
                return text.includes('anomaly') || text.includes('captcha') || text.includes('bots use');
            });

            if (resultLinks.length === 0 || isBlocked) {
                console.warn('  [SEARCH] DuckDuckGo blocked or no results. Trying Bing Search (Fallback)...');
                const bingUrl = 'https://www.bing.com/search?q=' + encodeURIComponent(searchQuery);
                await page.goto(bingUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

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
            }

            if (resultLinks.length === 0) {
                console.warn('  [SEARCH] No search results found on DuckDuckGo or Bing.');
                // Try to get any clickable links from last search page as last resort
                const anyLinks = await page.evaluate(() =>
                    Array.from(document.querySelectorAll('a[href^="http"]'))
                        .map((a) => (a as HTMLAnchorElement).href)
                        .filter(
                            (href) =>
                                !href.includes('duckduckgo.com') &&
                                !href.includes('duck.co') &&
                                !href.includes('bing.com') &&
                                !href.includes('microsoft.com')
                        )
                );
                if (anyLinks.length === 0) {
                    console.error('  [SEARCH] No links found at all on search pages.');
                    await page.close();
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
            const filteredLinks = filterAndRankLinks(resultLinks, searchQuery);
            console.log(`  [SEARCH] Raw links found:`, resultLinks);
            console.log(`  [SEARCH] Scored and ranked links:`, filteredLinks);

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
            console.log(`  [SEARCH] Target URL: ${targetLink}`);

            await page.close();
            return await this.scrapePage(targetLink);
        } catch (e: any) {
            console.error('  [SEARCH] searchAndScrape failed:', e.message);
            if (!page.isClosed()) await page.close();
            return null;
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
