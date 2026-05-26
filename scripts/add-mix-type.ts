import { query, end } from '../src/lib/db';

async function migrate() {
    try {
        console.log('Adding mix_type column to energy_mix table...');
        await query(`
            ALTER TABLE energy_mix
            ADD COLUMN mix_type ENUM('gesamtmix', 'unternehmensmix', 'tarifmix', 'unbekannt') DEFAULT NULL
            COMMENT 'Welcher Mix-Typ extrahiert wurde'
        `);
        console.log('Done. mix_type column added.');
    } catch (e: any) {
        if (e.code === 'ER_DUP_FIELDNAME') {
            console.log('Column mix_type already exists, skipping.');
        } else {
            throw e;
        }
    } finally {
        await end();
    }
}

migrate();
