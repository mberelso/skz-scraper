/**
 * Migration: Add priority column to providers table
 */

import { query } from '@/lib/db';
import pool from '@/lib/db';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function addPriority() {
    console.log('=== Adding priority column to providers table ===\n');

    try {
        // Check if column already exists
        const columns: any[] = await query(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'providers'
            AND COLUMN_NAME = 'priority'
        `);

        if (columns.length > 0) {
            console.log('⚠️  Column priority already exists. Skipping.');
            await pool.end();
            return;
        }

        // Add priority column
        await query(`
            ALTER TABLE providers
            ADD COLUMN priority INT DEFAULT 50 COMMENT 'Priorität 1-100 (höher = wichtiger), Default: 50'
            AFTER file_number
        `);

        console.log('✅ Column priority added successfully');

        // Add index
        await query(`
            ALTER TABLE providers
            ADD INDEX idx_priority (priority)
        `);

        console.log('✅ Index idx_priority added successfully');
    } catch (err: any) {
        console.error('❌ Migration failed:', err.message);
    } finally {
        await pool.end();
    }
}

addPriority();
