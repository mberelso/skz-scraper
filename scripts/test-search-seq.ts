import { ScraperEngine } from '../src/lib/scraper/engine';

const QUERIES = [
    'Voltego GmbH Stromkennzeichnung',
    'WestfalenWIND Strom GmbH Stromkennzeichnung',
    'voxenergie GmbH Stromkennzeichnung',
    'Werraenergie GmbH Stromkennzeichnung',
    'WindMW GmbH Stromkennzeichnung',
];

async function main() {
    for (const q of QUERIES) {
        const engine = new ScraperEngine();
        await engine.init();
        try {
            console.log(`\n########## QUERY: ${q}`);
            const result = await engine.searchAndScrape(q);
            console.log(
                result
                    ? `>>> OK: isPdf=${result.isPdf} src=${result.sourceUrl}`
                    : '>>> NULL (Keine Ergebnisse)'
            );
        } catch (e: any) {
            console.log(`>>> THREW: ${e.message}`);
        } finally {
            await engine.close();
        }
        await new Promise((r) => setTimeout(r, 3000));
    }
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
