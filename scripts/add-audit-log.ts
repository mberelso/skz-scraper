import pool from '../src/lib/db';

(async () => {
    const conn = await pool.getConnection();
    try {
        await conn.query(`
            CREATE TABLE IF NOT EXISTS audit_log (
                id INT AUTO_INCREMENT PRIMARY KEY,
                action ENUM('create', 'update', 'delete', 'review_change', 'scrape') NOT NULL,
                entity_type VARCHAR(50) NOT NULL COMMENT 'z.B. energy_mix, provider',
                entity_id INT DEFAULT NULL,
                provider_id INT DEFAULT NULL,
                old_value JSON DEFAULT NULL,
                new_value JSON DEFAULT NULL,
                description VARCHAR(500) DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_audit_provider (provider_id),
                INDEX idx_audit_created (created_at DESC)
            )
        `);
        console.log('Table audit_log created successfully');
    } catch (e: any) {
        console.error('Error:', e.message);
    } finally {
        conn.release();
        await pool.end();
    }
})();
