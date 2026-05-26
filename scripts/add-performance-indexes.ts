import 'dotenv/config';
import mariadb from 'mariadb';

/**
 * Performance-Indizes für häufige Queries
 * - Reduziert Scan-Time bei Filterung und Sortierung
 * - Optimiert Dashboard-Queries, Archiv-Abfragen, Batch-Status
 */
async function main() {
    const conn = await mariadb.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'skz_scraper',
    });

    console.log('=== Performance-Index-Migration ===\n');

    const indexes = [
        // Dashboard-Filterung: review_status
        {
            name: 'idx_review_status',
            table: 'providers',
            def: 'CREATE INDEX idx_review_status ON providers(review_status)',
        },
        // Dashboard-Sortierung: last_mix_year DESC
        {
            name: 'idx_last_mix_year',
            table: 'providers',
            def: 'CREATE INDEX idx_last_mix_year ON providers(last_mix_year DESC)',
        },
        // Energy-Mix Queries: Extraction-Method Filterung
        {
            name: 'idx_extraction_method',
            table: 'energy_mix',
            def: 'CREATE INDEX idx_extraction_method ON energy_mix(extraction_method)',
        },
        // Archiv-Query: Provider + Year kombiniert
        {
            name: 'idx_provider_year',
            table: 'energy_mix',
            def: 'CREATE INDEX idx_provider_year ON energy_mix(provider_id, year DESC)',
        },
        // Scrape-Jobs: Status-basierte Abfragen (laufende/fehlgeschlagene Jobs)
        {
            name: 'idx_job_status_date',
            table: 'scrape_jobs',
            def: 'CREATE INDEX idx_job_status_date ON scrape_jobs(status, started_at DESC)',
        },
        // Documents: Provider + Reporting-Year (häufige JOIN-Bedingung)
        {
            name: 'idx_doc_provider_year',
            table: 'documents',
            def: 'CREATE INDEX idx_doc_provider_year ON documents(provider_id, reporting_year DESC)',
        },
        // Audit-Log: Provider + Timestamp (Änderungshistorie)
        {
            name: 'idx_audit_provider_time',
            table: 'audit_log',
            def: 'CREATE INDEX idx_audit_provider_time ON audit_log(provider_id, created_at DESC)',
        },
    ];

    for (const idx of indexes) {
        try {
            // Check if index exists
            const existing = await conn.query(
                `SELECT COUNT(*) as cnt FROM information_schema.statistics
                 WHERE table_schema = DATABASE()
                 AND table_name = ?
                 AND index_name = ?`,
                [idx.table, idx.name]
            );

            if (existing[0].cnt > 0) {
                console.log(`  ⏭️  Index ${idx.name} existiert bereits`);
            } else {
                await conn.query(idx.def);
                console.log(`  ✅ Index ${idx.name} erstellt`);
            }
        } catch (e: any) {
            console.error(`  ❌ Fehler bei ${idx.name}: ${e.message}`);
        }
    }

    console.log('\n=== Migration abgeschlossen ===');
    console.log('Empfehlung: ANALYZE TABLE nach Index-Erstellung:');
    console.log('  ANALYZE TABLE providers, energy_mix, scrape_jobs, documents, audit_log;\n');

    await conn.end();
}

main().catch(console.error);
