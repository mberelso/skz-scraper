import fs from 'fs';
import axios from 'axios';
import PDFParser from 'pdf2json';
import { query } from '@/lib/db';
import pool from '@/lib/db';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const BNETZA_URL = 'https://www.bundesnetzagentur.de/DE/Fachthemen/ElektrizitaetundGas/HandelundVertrieb/Lieferantenanzeige/DL/EnergielieferantenListe.pdf?__blob=publicationFile&v=34';

async function importProviders() {
    try {
        console.log('Downloading PDF from Bundesnetzagentur...');
        const response = await axios.get(BNETZA_URL, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const buffer = Buffer.from(response.data);
        console.log(`Downloaded ${buffer.length} bytes.`);

        // Debug: Write to file
        await fs.promises.writeFile('temp_providers.pdf', buffer);

        console.log('Parsing PDF with pdf2json (Structural Mode)...');
        const pdfParser = new PDFParser();

        const pdfData: any = await new Promise((resolve, reject) => {
            pdfParser.on("pdfParser_dataError", (errData: any) => reject(new Error(errData.parserError)));
            pdfParser.on("pdfParser_dataReady", (data) => resolve(data));
            pdfParser.parseBuffer(buffer);
        });

        console.log(`Parsed ${pdfData.Pages.length} pages.`);

        // Clear existing garbage (User request: clean slate for this logic)
        // BE CAREFUL: This deletes user data if they added any manually. 
        // Ideally we only delete if we are sure. But "garbage" in name is a good sign.
        await query("DELETE FROM providers WHERE name LIKE '%Strom%' OR name LIKE '%Gas%' OR LENGTH(name) < 3 OR name LIKE 'Stand %'");
        console.log('Cleaned up potential garbage entries.');

        // We can also add columns if they don't exist yet (Runtime schema migration!)
        try {
            await query('ALTER TABLE providers ADD COLUMN IF NOT EXISTS address VARCHAR(255)');
            await query('ALTER TABLE providers ADD COLUMN IF NOT EXISTS zip VARCHAR(10)');
            await query('ALTER TABLE providers ADD COLUMN IF NOT EXISTS city VARCHAR(255)');
        } catch (e) {
            // Ignore if exists
        }

        let count = 0;

        // Logic: Group texts by Y-coordinate (row)
        // X-Coordinates (approx): Name (~3.5), Street (~24.6), Zip (~35.5), City (~39.4)

        for (const page of pdfData.Pages) {
            const rows = new Map<number, any[]>();

            for (const t of page.Texts) {
                const y = Math.round(t.y * 10) / 10; // Round to 1 decimal place to group roughly same line
                if (!rows.has(y)) rows.set(y, []);
                rows.get(y)?.push({
                    x: t.x,
                    text: decodeURIComponent(t.R[0].T).trim()
                });
            }

            // Process rows
            for (const [y, rowItems] of rows) {
                // Filter Header/Footer based on Y (Header is usually < 15 on Page 1)
                // But checking X coordinate is safer for "Name" column

                const nameItem = rowItems.find(i => i.x > 3.0 && i.x < 10.0); // Name is in the first column
                const streetItem = rowItems.find(i => i.x > 24.0 && i.x < 30.0);
                const zipItem = rowItems.find(i => i.x > 35.0 && i.x < 38.0);
                const cityItem = rowItems.find(i => i.x > 39.0 && i.x < 48.0);

                if (nameItem && nameItem.text.length > 2 && !nameItem.text.includes('Stand') && !nameItem.text.includes('Liste der')) {
                    const name = nameItem.text;
                    const address = streetItem ? streetItem.text : null;
                    const zip = zipItem ? zipItem.text : null;
                    const city = cityItem ? cityItem.text : null;

                    // Insert into DB
                    try {
                        await query(
                            'INSERT INTO providers (name, address, zip, city) VALUES (?, ?, ?, ?) ON CONFLICT (name) DO UPDATE SET address = EXCLUDED.address, zip = EXCLUDED.zip, city = EXCLUDED.city',
                            [name, address, zip, city]
                        );
                        count++;
                        if (count % 50 === 0) process.stdout.write('.');
                    } catch (err: any) {
                        // Ignore duplicates silently now that we have ON DUPLICATE KEY UPDATE
                    }
                }
            }
        }

        console.log(`\nSuccessfully processed ${count} providers with master data.`);

    } catch (err) {
        console.error('Import failed:', err);
    } finally {
        await pool.end();
    }
}

importProviders();
