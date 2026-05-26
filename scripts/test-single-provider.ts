import { runScrapeJob } from '../src/lib/scraper/runner';
import pool, { query } from '../src/lib/db';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function testSingle() {
    try {
        const providerName = 'Stadtwerke Leipzig';
        console.log(`Testing scraper for: ${providerName}`);

        // Find ID
        const rows = await query('SELECT id FROM providers WHERE name = ?', [providerName]);

        if (rows.length === 0) {
            console.error('Provider not found in DB');
            return;
        }

        const providerId = rows[0].id;
        await runScrapeJob(providerId, providerName);
        console.log('Test run finished.');
    } catch (e) {
        console.error('Test run failed:', e);
    } finally {
        await pool.end();
    }
}

testSingle();
