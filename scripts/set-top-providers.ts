/**
 * Set priority for top energy providers in Germany
 * Based on company size, customer count, and relevance
 */

import { query } from '@/lib/db';
import pool from '@/lib/db';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function setTopProviders() {
    console.log('=== Setting Priority for Top Providers ===\n');

    // Top providers in Germany (by customer count and relevance)
    const topProviders = {
        // Priority 100: Top 10 largest energy providers
        100: [
            'E.ON', 'RWE', 'EnBW', 'Vattenfall',
            'Stadtwerke München', 'Stadtwerke Hamburg', 'Mainova',
            'N-ERGIE', 'EWE', 'WEMAG'
        ],
        // Priority 90: Large regional providers and major city utilities
        90: [
            'Stadtwerke Berlin', 'Stadtwerke Düsseldorf', 'Stadtwerke Köln',
            'Stadtwerke Frankfurt', 'Stadtwerke Stuttgart', 'Stadtwerke Leipzig',
            'Stadtwerke Dresden', 'Stadtwerke Hannover', 'Stadtwerke Bremen',
            'Stadtwerke Nürnberg', 'Stadtwerke Dortmund', 'Stadtwerke Essen',
            'Stadtwerke Duisburg', 'SWB', 'Rheinenergie', 'MVV Energie',
            'Pfalzwerke', 'EWR', 'Thüga'
        ],
        // Priority 80: Medium-large city utilities
        80: [
            'Stadtwerke Augsburg', 'Stadtwerke Bielefeld', 'Stadtwerke Bochum',
            'Stadtwerke Bonn', 'Stadtwerke Braunschweig', 'Stadtwerke Chemnitz',
            'Stadtwerke Erfurt', 'Stadtwerke Freiburg', 'Stadtwerke Karlsruhe',
            'Stadtwerke Kiel', 'Stadtwerke Lübeck', 'Stadtwerke Magdeburg',
            'Stadtwerke Mainz', 'Stadtwerke Mannheim', 'Stadtwerke Münster',
            'Stadtwerke Rostock', 'Stadtwerke Wiesbaden', 'Stadtwerke Wuppertal'
        ],
        // Priority 70: Smaller city utilities and regional providers
        70: [
            'Stadtwerke Aachen', 'Stadtwerke Flensburg', 'Stadtwerke Göttingen',
            'Stadtwerke Heidelberg', 'Stadtwerke Ingolstadt', 'Stadtwerke Jena',
            'Stadtwerke Kassel', 'Stadtwerke Koblenz', 'Stadtwerke Konstanz',
            'Stadtwerke Lüneburg', 'Stadtwerke Oldenburg', 'Stadtwerke Osnabrück',
            'Stadtwerke Pforzheim', 'Stadtwerke Potsdam', 'Stadtwerke Regensburg',
            'Stadtwerke Schwerin', 'Stadtwerke Trier', 'Stadtwerke Ulm'
        ]
    };

    let totalUpdated = 0;

    for (const [priority, providerNames] of Object.entries(topProviders)) {
        for (const name of providerNames) {
            try {
                const result: any = await query(
                    `UPDATE providers SET priority = ? WHERE name LIKE ? AND active = TRUE`,
                    [parseInt(priority), `%${name}%`]
                );

                if (result.affectedRows > 0) {
                    console.log(`✅ Set priority ${priority} for "${name}" (${result.affectedRows} matches)`);
                    totalUpdated += result.affectedRows;
                }
            } catch (err: any) {
                console.error(`❌ Failed to update "${name}":`, err.message);
            }
        }
    }

    console.log(`\n=== Summary ===`);
    console.log(`✅ Updated ${totalUpdated} providers with higher priority`);

    await pool.end();
}

setTopProviders();
