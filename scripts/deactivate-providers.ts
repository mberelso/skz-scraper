/**
 * Deactivate providers by IDs
 * Usage: npx tsx scripts/deactivate-providers.ts 1 2 3
 */

import { query } from '@/lib/db';
import pool from '@/lib/db';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function deactivateProviders() {
    const ids = process.argv
        .slice(2)
        .map((id) => parseInt(id, 10))
        .filter((id) => !isNaN(id));

    if (ids.length === 0) {
        console.error('❌ Keine gültigen IDs angegeben.');
        console.error('Usage: npx tsx scripts/deactivate-providers.ts 1 2 3');
        process.exit(1);
    }

    console.log(`=== PROVIDER DEAKTIVIEREN ===\n`);
    console.log(`IDs: ${ids.join(', ')}\n`);

    // Show what will be deactivated
    const providers: any[] = await query(`SELECT id, name FROM providers WHERE id IN (${ids.join(', ')})`);

    if (providers.length === 0) {
        console.log('⚠️  Keine Provider mit diesen IDs gefunden.');
        await pool.end();
        return;
    }

    console.log('Folgende Provider werden deaktiviert:');
    providers.forEach((p) => console.log(`  - ID ${p.id}: ${p.name}`));
    console.log('');

    // Deactivate
    const result: any = await query(`UPDATE providers SET active = FALSE WHERE id IN (${ids.join(', ')})`);

    console.log(`✅ ${result.affectedRows} Provider deaktiviert`);

    await pool.end();
}

deactivateProviders();
