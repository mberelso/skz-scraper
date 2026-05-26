import puppeteer from 'puppeteer';
import fs from 'fs/promises';

async function main() {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    try {
        const query = 'AggerEnergie GmbH Stromkennzeichnung Energiemix';
        const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query);
        console.log(`Navigating to: ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        console.log('Taking screenshot...');
        await page.screenshot({ path: 'ddg_search.png' });
        
        const html = await page.content();
        await fs.writeFile('ddg_search.html', html);
        console.log('HTML saved to ddg_search.html, screenshot saved to ddg_search.png');
    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
}
main();
