/**
 * Migration Script: Ändert das Unique-Constraint der documents-Tabelle.
 * Ersetzt das globale UNIQUE(file_hash) durch UNIQUE(provider_id, file_hash).
 *
 * Usage: npx tsx scripts/migrate-unique-hash.ts
 */

import { query } from '../src/lib/db';
import pool from '../src/lib/db';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function migrate() {
    console.log('=== SKZ-Scraper DB Migration (Unique-Hash-Constraint) ===\n');

    try {
        // 1. Drop the global unique constraint if it exists
        console.log('Droppe globales unique constraint "documents_file_hash_key"...');
        try {
            await query('ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_file_hash_key');
            console.log('  -> Constraint "documents_file_hash_key" erfolgreich entfernt (oder existierte nicht).');
        } catch (e: any) {
            console.error('  ! Fehler beim Droppen von documents_file_hash_key:', e.message);
        }

        // 2. Check if the new composite constraint already exists
        const check: any[] = await query(`
            SELECT constraint_name 
            FROM information_schema.table_constraints 
            WHERE table_name = 'documents' AND constraint_name = 'unique_provider_file_hash'
        `);

        if (check.length === 0) {
            console.log(
                '\nErstelle zusammengesetztes Unique-Constraint "unique_provider_file_hash" (provider_id, file_hash)...'
            );
            await query(
                'ALTER TABLE documents ADD CONSTRAINT unique_provider_file_hash UNIQUE (provider_id, file_hash)'
            );
            console.log('  -> Constraint "unique_provider_file_hash" erfolgreich erstellt.');
        } else {
            console.log(
                '\nZusammengesetztes Unique-Constraint "unique_provider_file_hash" existiert bereits. Überspringe.'
            );
        }

        console.log('\n=== Unique-Hash-Migration erfolgreich abgeschlossen ===');
    } catch (err) {
        console.error('\nMigration fehlgeschlagen:', err);
    } finally {
        await pool.end();
    }
}

migrate();
