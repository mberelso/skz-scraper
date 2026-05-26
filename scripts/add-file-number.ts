/**
 * Migration: Add file_number column to providers table
 */

import { query } from '@/lib/db';
import pool from '@/lib/db';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function addFileNumber() {
    console.log('=== Adding file_number column to providers table ===\n');

    try {
        // Check if column already exists
        const columns: any[] = await query(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'providers'
            AND COLUMN_NAME = 'file_number'
        `);

        if (columns.length > 0) {
            console.log('⚠️  Column file_number already exists. Skipping.');
            await pool.end();
            return;
        }

        // Add file_number column
        await query(`
            ALTER TABLE providers
            ADD COLUMN file_number VARCHAR(20) DEFAULT NULL COMMENT 'Aktenzeichen im Format: 12 122/123'
            AFTER city
        `);

        console.log('✅ Column file_number added successfully');

        // Add index
        await query(`
            ALTER TABLE providers
            ADD INDEX idx_file_number (file_number)
        `);

        console.log('✅ Index idx_file_number added successfully');
    } catch (err: any) {
        console.error('❌ Migration failed:', err.message);
    } finally {
        await pool.end();
    }
}

addFileNumber();
