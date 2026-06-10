import { query } from '../src/lib/db';

async function main() {
    const jobs = await query(
        `SELECT j.id, j.provider_id, p.name, j.status, j.log_message, j.started_at, j.finished_at
         FROM scrape_jobs j LEFT JOIN providers p ON p.id = j.provider_id
         ORDER BY j.id DESC LIMIT 30`
    );
    for (const j of jobs) {
        console.log(
            `#${j.id} [${j.status}] ${j.name} | ${j.started_at?.toISOString?.() ?? j.started_at}`
        );
        if (j.log_message) console.log(`   LOG: ${j.log_message}`);
    }

    const stats = await query(
        `SELECT status, COUNT(*) AS cnt FROM scrape_jobs GROUP BY status ORDER BY cnt DESC`
    );
    console.log('\nStatus-Verteilung:', JSON.stringify(stats));
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
