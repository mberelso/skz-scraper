/**
 * Migration Script: Erweitert das DB-Schema für den verbesserten SKZ-Scraper (PostgreSQL).
 *
 * Fügt hinzu (falls noch nicht vorhanden):
 * - documents: provider_id, source_url, original_filename, reporting_year
 * - energy_mix: provider_id, Unterkategorien, Konfidenz, Extraktionsmethode, Tarif-Name, EEG-Anteil
 * - providers: skz_url Feld für direkte Stromkennzeichnungs-URL
 *
 * Kann mehrfach ausgeführt werden (IF NOT EXISTS / idempotent).
 *
 * Usage: npx tsx scripts/migrate-db.ts
 */

import { query } from '../src/lib/db';
import pool from '../src/lib/db';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function migrate() {
    console.log('=== SKZ-Scraper DB Migration (PostgreSQL) ===\n');

    try {
        // --- providers table ---
        console.log('[1/5] Erweitere providers-Tabelle...');
        const providerColumns = [
            { name: 'skz_url', def: 'VARCHAR(512) DEFAULT NULL' },
            { name: 'address', def: 'VARCHAR(255) DEFAULT NULL' },
            { name: 'zip', def: 'VARCHAR(10) DEFAULT NULL' },
            { name: 'city', def: 'VARCHAR(255) DEFAULT NULL' },
        ];

        for (const col of providerColumns) {
            try {
                await query(`ALTER TABLE providers ADD COLUMN IF NOT EXISTS ${col.name} ${col.def}`);
                console.log(`  + providers.${col.name}`);
            } catch (e: any) {
                console.error(`  ! providers.${col.name}: ${e.message}`);
            }
        }

        // --- documents table ---
        console.log('\n[2/5] Erweitere documents-Tabelle...');
        const docColumns = [
            { name: 'provider_id', def: 'INT DEFAULT NULL' },
            { name: 'source_url', def: 'VARCHAR(1024) DEFAULT NULL' },
            { name: 'original_filename', def: 'VARCHAR(512) DEFAULT NULL' },
            { name: 'reporting_year', def: 'INT DEFAULT NULL' },
        ];

        for (const col of docColumns) {
            try {
                await query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS ${col.name} ${col.def}`);
                console.log(`  + documents.${col.name}`);
            } catch (e: any) {
                console.error(`  ! documents.${col.name}: ${e.message}`);
            }
        }

        // Add indexes for documents
        try {
            await query('CREATE INDEX IF NOT EXISTS idx_doc_provider_id ON documents (provider_id)');
            console.log('  + documents.idx_doc_provider_id');
        } catch (e: any) {
            console.error(`  ! idx_doc_provider_id: ${e.message}`);
        }
        try {
            await query('CREATE INDEX IF NOT EXISTS idx_doc_reporting_year ON documents (reporting_year)');
            console.log('  + documents.idx_doc_reporting_year');
        } catch (e: any) {
            console.error(`  ! idx_doc_reporting_year: ${e.message}`);
        }

        // --- energy_mix table ---
        console.log('\n[3/5] Erweitere energy_mix-Tabelle...');
        const mixColumns = [
            { name: 'provider_id', def: 'INT DEFAULT NULL' },
            { name: 'wind_percentage', def: 'DECIMAL(5,2) DEFAULT NULL' },
            { name: 'solar_percentage', def: 'DECIMAL(5,2) DEFAULT NULL' },
            { name: 'biomass_percentage', def: 'DECIMAL(5,2) DEFAULT NULL' },
            { name: 'hydro_percentage', def: 'DECIMAL(5,2) DEFAULT NULL' },
            { name: 'other_renewable_percentage', def: 'DECIMAL(5,2) DEFAULT NULL' },
            { name: 'coal_percentage', def: 'DECIMAL(5,2) DEFAULT NULL' },
            { name: 'natural_gas_percentage', def: 'DECIMAL(5,2) DEFAULT NULL' },
            { name: 'other_fossil_percentage', def: 'DECIMAL(5,2) DEFAULT NULL' },
            { name: 'eeg_percentage', def: 'DECIMAL(5,2) DEFAULT NULL' },
            { name: 'tariff_name', def: 'VARCHAR(255) DEFAULT NULL' },
            { name: 'confidence', def: 'INT DEFAULT NULL' },
            { name: 'extraction_method', def: 'VARCHAR(50) DEFAULT NULL' },
        ];

        for (const col of mixColumns) {
            try {
                await query(`ALTER TABLE energy_mix ADD COLUMN IF NOT EXISTS ${col.name} ${col.def}`);
                console.log(`  + energy_mix.${col.name}`);
            } catch (e: any) {
                console.error(`  ! energy_mix.${col.name}: ${e.message}`);
            }
        }

        // Add indexes for energy_mix
        try {
            await query('CREATE INDEX IF NOT EXISTS idx_energy_mix_provider ON energy_mix (provider_id)');
            console.log('  + energy_mix.idx_energy_mix_provider');
        } catch (e: any) {
            console.error(`  ! idx_energy_mix_provider: ${e.message}`);
        }
        try {
            await query('CREATE INDEX IF NOT EXISTS idx_energy_mix_provider_year ON energy_mix (provider_id, year)');
            console.log('  + energy_mix.idx_energy_mix_provider_year');
        } catch (e: any) {
            console.error(`  ! idx_energy_mix_provider_year: ${e.message}`);
        }

        // --- Backfills ---
        console.log('\n[4/5] Backfills ausführen...');
        try {
            const backfillDocsResult: any = await query(`
                UPDATE documents d
                SET provider_id = j.provider_id
                FROM scrape_jobs j
                WHERE d.job_id = j.id AND d.provider_id IS NULL
            `);
            console.log(`  Documents aktualisiert: ${backfillDocsResult?.affectedRows || 0}`);
        } catch (e: any) {
            console.error('  ! Backfill documents.provider_id failed:', e.message);
        }

        try {
            const backfillMixResult: any = await query(`
                UPDATE energy_mix em
                SET provider_id = d.provider_id
                FROM documents d
                WHERE em.document_id = d.id AND em.provider_id IS NULL
            `);
            console.log(`  Energy Mix Einträge aktualisiert: ${backfillMixResult?.affectedRows || 0}`);
        } catch (e: any) {
            console.error('  ! Backfill energy_mix.provider_id failed:', e.message);
        }

        try {
            const backfillYearResult: any = await query(`
                UPDATE documents d
                SET reporting_year = em.year
                FROM energy_mix em
                WHERE em.document_id = d.id AND d.reporting_year IS NULL AND em.year IS NOT NULL
            `);
            console.log(`  Documents reporting_year aktualisiert: ${backfillYearResult?.affectedRows || 0}`);
        } catch (e: any) {
            console.error('  ! Backfill documents.reporting_year failed:', e.message);
        }

        // --- Verify ---
        console.log('\n[5/5] Schema-Verifizierung...');
        const providerCols: any[] = await query("SELECT column_name FROM information_schema.columns WHERE table_name = 'providers'");
        const docCols: any[] = await query("SELECT column_name FROM information_schema.columns WHERE table_name = 'documents'");
        const mixCols: any[] = await query("SELECT column_name FROM information_schema.columns WHERE table_name = 'energy_mix'");

        console.log(`  providers: ${providerCols.length} Spalten`);
        console.log(`  documents: ${docCols.length} Spalten`);
        console.log(`  energy_mix: ${mixCols.length} Spalten`);

        console.log('\n=== Migration abgeschlossen ===');

    } catch (err) {
        console.error('\nMigration fehlgeschlagen:', err);
    } finally {
        await pool.end();
    }
}

migrate();
