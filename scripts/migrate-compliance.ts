import { query } from '../src/lib/db';

async function migrate() {
    console.log('Running compliance migrations...');
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS federal_constants (
                year INT PRIMARY KEY,
                eeg_percentage DECIMAL(5,2) NOT NULL,
                renewable_percentage DECIMAL(5,2) NOT NULL,
                fossil_percentage DECIMAL(5,2) NOT NULL,
                nuclear_percentage DECIMAL(5,2) NOT NULL,
                co2_emission_g_kwh DECIMAL(6,2) NOT NULL,
                radioactive_waste_mg_kwh DECIMAL(10,4) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await query(`
            CREATE TABLE IF NOT EXISTS provider_yearly_stats (
                id SERIAL PRIMARY KEY,
                provider_id INT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
                year INT NOT NULL,
                delivered_volume_mwh DECIMAL(15,2) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT unique_provider_year UNIQUE (provider_id, year)
            );
        `);
        await query(`
            CREATE TABLE IF NOT EXISTS hkn_cancellations (
                id SERIAL PRIMARY KEY,
                provider_id INT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
                year INT NOT NULL,
                country VARCHAR(100) NOT NULL,
                amount_mwh DECIMAL(15,2) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT unique_provider_year_country UNIQUE (provider_id, year, country)
            );
        `);
        await query(`
            CREATE TABLE IF NOT EXISTS compliance_audits (
                id SERIAL PRIMARY KEY,
                provider_id INT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
                year INT NOT NULL,
                status VARCHAR(50) DEFAULT 'offen' CHECK (status IN ('offen', 'plausibel', 'fehlerhaft_eeg', 'fehlerhaft_hkn', 'beanstandet')),
                hkn_deviation_percent DECIMAL(8,2) DEFAULT NULL,
                audit_note TEXT DEFAULT NULL,
                audited_by VARCHAR(100) DEFAULT NULL,
                audited_at TIMESTAMP DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT unique_audit_provider_year UNIQUE (provider_id, year)
            );
        `);
        console.log('Migration completed successfully.');
    } catch (e: any) {
        console.error('Migration failed:', e.message);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}
migrate();
