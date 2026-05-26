-- Datenbank Schema für SKZ-Scraper (PostgreSQL-kompatibel für Neon/Supabase)
-- Stromkennzeichen-Datenbank deutscher Energieversorger

-- Tabelle der Energieversorger
CREATE TABLE IF NOT EXISTS providers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    url VARCHAR(512),
    skz_url VARCHAR(512) DEFAULT NULL,
    address VARCHAR(255) DEFAULT NULL,
    zip VARCHAR(10) DEFAULT NULL,
    city VARCHAR(255) DEFAULT NULL,
    file_number VARCHAR(20) DEFAULT NULL,
    priority INT DEFAULT 50,
    review_status VARCHAR(50) DEFAULT 'offen' CHECK (review_status IN ('offen', 'geprueft', 'beanstandet')),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_provider_name UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_file_number ON providers (file_number);
CREATE INDEX IF NOT EXISTS idx_priority ON providers (priority);

-- Tabelle für Scraping-Jobs
CREATE TABLE IF NOT EXISTS scrape_jobs (
    id SERIAL PRIMARY KEY,
    provider_id INT REFERENCES providers(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'failed', 'partial')),
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP NULL,
    log_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_status ON scrape_jobs (status);
CREATE INDEX IF NOT EXISTS idx_provider_latest ON scrape_jobs (provider_id, id DESC);

-- Tabelle für gespeicherte Dokumente (Beweise)
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    job_id INT REFERENCES scrape_jobs(id) ON DELETE CASCADE,
    provider_id INT DEFAULT NULL REFERENCES providers(id) ON DELETE CASCADE,
    file_type VARCHAR(50) NOT NULL CHECK (file_type IN ('pdf', 'html', 'image', 'manual')),
    file_path VARCHAR(512) NOT NULL,
    file_hash VARCHAR(64) UNIQUE,
    source_url VARCHAR(1024) DEFAULT NULL,
    original_filename VARCHAR(512) DEFAULT NULL,
    reporting_year INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_provider_id ON documents (provider_id);
CREATE INDEX IF NOT EXISTS idx_reporting_year ON documents (reporting_year);

-- Tabelle für die extrahierten Kennzahlen
CREATE TABLE IF NOT EXISTS energy_mix (
    id SERIAL PRIMARY KEY,
    document_id INT REFERENCES documents(id) ON DELETE CASCADE,
    provider_id INT DEFAULT NULL REFERENCES providers(id) ON DELETE CASCADE,
    year INT,
    
    -- Aggregierte Hauptkategorien (%)
    renewable_percentage DECIMAL(5,2),
    fossil_percentage DECIMAL(5,2),
    nuclear_percentage DECIMAL(5,2),
    
    -- Erneuerbare Unterkategorien (%)
    wind_percentage DECIMAL(5,2) DEFAULT NULL,
    solar_percentage DECIMAL(5,2) DEFAULT NULL,
    biomass_percentage DECIMAL(5,2) DEFAULT NULL,
    hydro_percentage DECIMAL(5,2) DEFAULT NULL,
    other_renewable_percentage DECIMAL(5,2) DEFAULT NULL,
    
    -- Fossile Unterkategorien (%)
    coal_percentage DECIMAL(5,2) DEFAULT NULL,
    natural_gas_percentage DECIMAL(5,2) DEFAULT NULL,
    other_fossil_percentage DECIMAL(5,2) DEFAULT NULL,
    
    -- EE-Unterkategorien nach Förderung/Herkunft
    eeg_funded_percentage DECIMAL(5,2) DEFAULT NULL,
    hkn_percentage DECIMAL(5,2) DEFAULT NULL,
    mieterstrom_percentage DECIMAL(5,2) DEFAULT NULL,

    -- EEG-Anteil (gesamt)
    eeg_percentage DECIMAL(5,2) DEFAULT NULL,
    
    -- Umweltauswirkungen
    co2_emission_g_kwh DECIMAL(6,2),
    radioactive_waste_mg_kwh DECIMAL(10,4),
    
    -- Tarif-Informationen
    tariff_name VARCHAR(255) DEFAULT NULL,
    
    -- Extraktions-Metadaten
    confidence INT DEFAULT NULL,
    extraction_method VARCHAR(50) DEFAULT NULL CHECK (extraction_method IN ('gemini_vision', 'gemini_text', 'regex', 'manual', 'ocr')),
    mix_type VARCHAR(50) DEFAULT NULL CHECK (mix_type IN ('gesamtmix', 'unternehmensmix', 'tarifmix', 'unbekannt')),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_energy_mix_provider ON energy_mix (provider_id);
CREATE INDEX IF NOT EXISTS idx_energy_mix_provider_year ON energy_mix (provider_id, year);

-- Herkunftsländer der Herkunftsnachweise (HKN) pro Strommix
CREATE TABLE IF NOT EXISTS hkn_origins (
    id SERIAL PRIMARY KEY,
    energy_mix_id INT NOT NULL REFERENCES energy_mix(id) ON DELETE CASCADE,
    country VARCHAR(100) NOT NULL,
    percentage DECIMAL(5,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hkn_mix ON hkn_origins (energy_mix_id);

-- Singleton-Tabelle für Batch-Verarbeitungsstatus
CREATE TABLE IF NOT EXISTS batch_status (
    id INT PRIMARY KEY DEFAULT 1,
    is_running BOOLEAN DEFAULT FALSE,
    current_index INT DEFAULT 0,
    total INT DEFAULT 0,
    current_provider VARCHAR(255) DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO batch_status (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Notizen / Aktenvermerke pro Provider
CREATE TABLE IF NOT EXISTS provider_notes (
    id SERIAL PRIMARY KEY,
    provider_id INT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notes_provider ON provider_notes (provider_id);
CREATE INDEX IF NOT EXISTS idx_notes_created ON provider_notes (created_at DESC);

-- Audit-Log für Änderungshistorie
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    action VARCHAR(50) NOT NULL CHECK (action IN ('create', 'update', 'delete', 'review_change', 'scrape')),
    entity_type VARCHAR(50) NOT NULL,
    entity_id INT DEFAULT NULL,
    provider_id INT DEFAULT NULL,
    old_value JSON DEFAULT NULL,
    new_value JSON DEFAULT NULL,
    description VARCHAR(500) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_provider ON audit_log (provider_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at DESC);
