import { query } from '../src/lib/db';

async function main() {
    console.log('Creating provider_notes table...');
    await query(`
        CREATE TABLE IF NOT EXISTS provider_notes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            provider_id INT NOT NULL,
            text TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE,
            INDEX idx_notes_provider (provider_id),
            INDEX idx_notes_created (created_at DESC)
        )
    `);
    console.log('Done.');
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
