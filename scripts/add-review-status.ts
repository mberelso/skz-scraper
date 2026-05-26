import pool from '../src/lib/db';

(async () => {
    const conn = await pool.getConnection();
    try {
        await conn.query(`
            ALTER TABLE providers
            ADD COLUMN review_status ENUM('offen', 'geprueft', 'beanstandet') DEFAULT 'offen'
            COMMENT 'Prüfstatus für § 42 EnWG'
        `);
        console.log('Column review_status added successfully');
    } catch (e: any) {
        if (e.message?.includes('Duplicate column')) {
            console.log('Column review_status already exists');
        } else {
            console.error('Error:', e.message);
        }
    } finally {
        conn.release();
        await pool.end();
    }
})();
