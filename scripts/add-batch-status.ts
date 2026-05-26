import { query } from '../src/lib/db';

async function migrate() {
    try {
        console.log('Creating batch_status table...');
        await query(`
            CREATE TABLE IF NOT EXISTS batch_status (
                id INT PRIMARY KEY DEFAULT 1,
                is_running BOOLEAN DEFAULT FALSE,
                current_index INT DEFAULT 0,
                total INT DEFAULT 0,
                current_provider VARCHAR(255) DEFAULT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        await query('INSERT IGNORE INTO batch_status (id) VALUES (1)');
        console.log('Done. batch_status table created.');
    } catch (e: any) {
        console.error('Error:', e.message);
    }
    process.exit(0);
}

migrate();
