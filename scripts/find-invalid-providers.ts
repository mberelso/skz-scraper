/**
 * Find invalid providers (laws, administrations, etc.) in the database
 */

import { query } from '@/lib/db';
import pool from '@/lib/db';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function findInvalidProviders() {
    const suspicious = [
        'verordnung',
        'gesetz',
        'recht',
        'paragraph',
        'eigenbetrieb',
        'anstalts',
        'verwaltung',
        'c/o',
        'verbandsgemeindeverwaltung',
        'ministerium',
        'behörde',
        'landesrecht',
    ];

    const providers: any[] = await query(`
        SELECT id, name, city, active
        FROM providers
        ORDER BY id ASC
    `);

    const invalidProviders = providers.filter((p) =>
        suspicious.some((keyword) => p.name?.toLowerCase().includes(keyword))
    );

    console.log('=== UNGÜLTIGE PROVIDER (Gesetze/Verwaltungen) ===\n');
    if (invalidProviders.length === 0) {
        console.log('✅ Keine ungültigen Provider gefunden.');
    } else {
        console.log(`⚠️  Gefunden: ${invalidProviders.length} ungültige Provider\n`);
        invalidProviders.forEach((p) => {
            console.log(`ID ${p.id}: ${p.name}`);
            console.log(`  Stadt: ${p.city || '-'}`);
            console.log(`  Aktiv: ${p.active ? 'JA' : 'Nein'}`);
            console.log('');
        });

        const ids = invalidProviders.map((p) => p.id).join(', ');
        console.log('=== LÖSUNG ===');
        console.log('Diese Provider deaktivieren:');
        console.log(`npx tsx scripts/deactivate-providers.ts ${ids}`);
    }

    await pool.end();
}

findInvalidProviders();
