/**
 * Migration: Quellen-Wächter
 * - energy_mix.source_status: NULL = Quelle plausibel, 'unbestaetigt' = fremde Domain
 *   (manuell prüfen!), 'bestaetigt' = manuell als korrekt bestätigt
 * - trusted_sources: pro Provider bestätigte Fremd-Domains (z.B. Akronym-Domains, CDNs)
 */
import { query } from '../src/lib/db';

async function main() {
    await query(`ALTER TABLE energy_mix ADD COLUMN IF NOT EXISTS source_status VARCHAR(20) DEFAULT NULL`);
    await query(`
        DO $$ BEGIN
            ALTER TABLE energy_mix ADD CONSTRAINT chk_source_status
                CHECK (source_status IN ('unbestaetigt', 'bestaetigt'));
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    `);
    await query(`
        CREATE TABLE IF NOT EXISTS trusted_sources (
            id SERIAL PRIMARY KEY,
            provider_id INT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
            domain VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT unique_provider_domain UNIQUE (provider_id, domain)
        )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_mix_source_status ON energy_mix (source_status)`);
    console.log('✅ Migration source_status + trusted_sources abgeschlossen');
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
