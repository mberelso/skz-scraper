import 'dotenv/config';
import mariadb from 'mariadb';

async function migrate() {
    const pool = mariadb.createPool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'skz_scraper',
    });

    try {
        console.log('Adding "ocr" to extraction_method ENUM...');
        await pool.query(`
            ALTER TABLE energy_mix
            MODIFY extraction_method ENUM('gemini_vision', 'gemini_text', 'regex', 'manual', 'ocr') DEFAULT NULL
        `);
        console.log('Done.');
    } finally {
        await pool.end();
    }
}

migrate().catch(console.error);
