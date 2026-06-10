import { query } from '../src/lib/db';

async function main() {
    const docs = await query('SELECT COUNT(*) AS cnt FROM documents');
    const orphanMixes = await query(
        `SELECT COUNT(*) AS cnt FROM energy_mix em
         WHERE em.document_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.id = em.document_id)`
    );
    const mixes = await query('SELECT COUNT(*) AS cnt FROM energy_mix');
    const resetJobs = await query(
        `SELECT id, provider_id, status, log_message FROM scrape_jobs WHERE log_message LIKE 'Bereinigt:%' ORDER BY id`
    );
    console.log(`Dokumente: ${docs[0].cnt}`);
    console.log(`Energy-Mix gesamt: ${mixes[0].cnt}, verwaiste Mixe: ${orphanMixes[0].cnt}`);
    console.log(`Auf 'failed' zurückgesetzte Jobs: ${resetJobs.length}`);
    for (const j of resetJobs) console.log(`  job#${j.id} [${j.status}]`);
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
