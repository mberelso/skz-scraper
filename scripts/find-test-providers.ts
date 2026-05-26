/**
 * Find and list test/dummy providers in the database
 */

import { query } from '@/lib/db';
import pool from '@/lib/db';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function findTestData() {
    const suspicious = ['muster', 'test', 'example', 'demo', 'sample', 'beispiel', 'platzhalter'];

    const providers: any[] = await query(`
        SELECT id, name, city, zip, address, active,
               (SELECT COUNT(*) FROM scrape_jobs WHERE provider_id = providers.id) as job_count,
               (SELECT COUNT(*) FROM documents WHERE provider_id = providers.id) as doc_count
        FROM providers
        ORDER BY id ASC
    `);

    const testProviders = providers.filter((p) =>
        suspicious.some((keyword) => p.name?.toLowerCase().includes(keyword) || p.city?.toLowerCase().includes(keyword))
    );

    console.log('=== VERDÄCHTIGE PROVIDER (Karteileichen) ===\n');
    if (testProviders.length === 0) {
        console.log('Keine verdächtigen Provider gefunden.');
    } else {
        console.log(`Gefunden: ${testProviders.length} Provider\n`);
        testProviders.forEach((p) => {
            console.log(`ID: ${p.id}`);
            console.log(`  Name: ${p.name}`);
            console.log(`  Stadt: ${p.city || '-'}, PLZ: ${p.zip || '-'}`);
            console.log(`  Adresse: ${p.address || '-'}`);
            console.log(`  Aktiv: ${p.active ? 'Ja' : 'Nein'}`);
            console.log(`  Jobs: ${p.job_count}, Dokumente: ${p.doc_count}`);
            console.log('');
        });

        console.log('\n=== LÖSCH-VORSCHLAG ===');
        const ids = testProviders.map((p) => p.id).join(', ');
        console.log('SQL DELETE Statement:');
        console.log(`DELETE FROM providers WHERE id IN (${ids});`);
        console.log('\nOder per Script:');
        console.log(`npx tsx scripts/delete-providers.ts ${ids}`);
    }

    await pool.end();
}

findTestData();
