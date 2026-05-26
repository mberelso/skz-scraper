import pool from '../src/lib/db';

(async () => {
    const conn = await pool.getConnection();
    try {
        await conn.query('CREATE INDEX idx_provider_latest ON scrape_jobs (provider_id, id DESC)');
        console.log('Index idx_provider_latest created successfully');
    } catch (e: any) {
        if (e.message?.includes('Duplicate')) {
            console.log('Index idx_provider_latest already exists');
        } else {
            console.error('Error:', e.message);
        }
    } finally {
        conn.release();
        await pool.end();
    }
})();
