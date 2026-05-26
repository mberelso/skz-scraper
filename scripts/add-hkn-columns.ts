import { query } from '../src/lib/db';
import pool from '../src/lib/db';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

/**
 * Migration: Add EE subcategory columns to energy_mix + create hkn_origins table (PostgreSQL)
 */
async function main() {
    console.log('=== Migration: HKN-Herkunftsländer + EE-Unterkategorien (PostgreSQL) ===\n');

    // 1. Add new columns to energy_mix
    const newColumns = [
        { name: 'eeg_funded_percentage', def: 'DECIMAL(5,2) DEFAULT NULL' },
        { name: 'hkn_percentage', def: 'DECIMAL(5,2) DEFAULT NULL' },
        { name: 'mieterstrom_percentage', def: 'DECIMAL(5,2) DEFAULT NULL' },
    ];

    for (const col of newColumns) {
        try {
            await query(`ALTER TABLE energy_mix ADD COLUMN IF NOT EXISTS ${col.name} ${col.def}`);
            console.log(`  ✅ Column ${col.name} added`);
        } catch (e: any) {
            console.error(`  ❌ Column ${col.name} failed:`, e.message);
        }
    }

    // 2. Create hkn_origins table
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS hkn_origins (
                id SERIAL PRIMARY KEY,
                energy_mix_id INT NOT NULL REFERENCES energy_mix(id) ON DELETE CASCADE,
                country VARCHAR(100) NOT NULL,
                percentage DECIMAL(5,2) NOT NULL
            )
        `);
        // Add index separately for PostgreSQL
        await query('CREATE INDEX IF NOT EXISTS idx_hkn_mix ON hkn_origins (energy_mix_id)');

        console.log('  ✅ Table hkn_origins created (or already exists)');
    } catch (e: any) {
        console.error('  ❌ Failed to create hkn_origins:', e.message);
    }

    console.log('\n=== Migration complete ===');
    await pool.end();
}

main().catch(console.error);
