/**
 * Findet und löscht Dokumente (+ zugehörige energy_mix-Einträge und Storage-Dateien),
 * deren source_url nicht zum Anbieter passt — also Stromkennzeichnungen FREMDER
 * Anbieter, die durch den alten Ranking-Bug gespeichert wurden.
 *
 * Dry-Run:  npx tsx scripts/cleanup-foreign-docs.ts
 * Löschen:  npx tsx scripts/cleanup-foreign-docs.ts --execute
 */
import { query } from '../src/lib/db';
import { getCleanedProviderWords } from '../src/lib/scraper/search-helper';
import { deleteFile } from '../src/lib/storage';

const EXECUTE = process.argv.includes('--execute');

// Manuell verifizierte Ausnahmen: Domain passt nicht zum Namen, gehört aber doch zum Anbieter
// doc#60: bmv-classic.de = "BMV Energie" = Bernburger Mineralölvertrieb Lühmann (Akronym-Domain)
const KEEP_DOC_IDS = new Set([60]);

function sourceMatchesProvider(sourceUrl: string, providerName: string): boolean | null {
    const words = getCleanedProviderWords(providerName);
    if (words.length === 0) return null; // nicht beurteilbar
    try {
        const parsed = new URL(sourceUrl);
        const hostname = parsed.hostname.toLowerCase();
        const pathAndQuery = decodeURIComponent(parsed.pathname + parsed.search).toLowerCase();
        return words.some((w) => hostname.includes(w) || pathAndQuery.includes(w));
    } catch {
        return null;
    }
}

async function main() {
    const docs: any[] = await query(
        `SELECT d.id, d.job_id, d.provider_id, d.file_type, d.file_path, d.source_url, p.name
         FROM documents d
         JOIN providers p ON p.id = d.provider_id
         WHERE d.file_type != 'manual' AND d.source_url IS NOT NULL
         ORDER BY d.id ASC`
    );

    const foreign: any[] = [];
    const unjudgeable: any[] = [];

    for (const d of docs) {
        if (KEEP_DOC_IDS.has(d.id)) {
            console.log(`  KEEP doc#${d.id} [${d.name}] (manuell verifizierte Ausnahme)`);
            continue;
        }
        const match = sourceMatchesProvider(d.source_url, d.name);
        if (match === false) foreign.push(d);
        else if (match === null) unjudgeable.push(d);
    }

    console.log(`Dokumente gesamt (scraped, mit Quelle): ${docs.length}`);
    console.log(`Davon FREMD (Quelle ohne Anbieter-Bezug): ${foreign.length}`);
    console.log(`Nicht beurteilbar (übersprungen): ${unjudgeable.length}\n`);

    for (const d of unjudgeable) {
        console.log(`  SKIP doc#${d.id} [${d.name}] ${d.source_url}`);
    }
    console.log('');

    for (const d of foreign) {
        const mixes: any[] = await query('SELECT id, year, extraction_method FROM energy_mix WHERE document_id = ?', [
            d.id,
        ]);
        const manualMixes = mixes.filter((m) => m.extraction_method === 'manual');
        console.log(`  FREMD doc#${d.id} (${d.file_type}) [${d.name}]`);
        console.log(`        Quelle: ${d.source_url}`);
        console.log(`        Datei:  ${d.file_path}`);
        console.log(
            `        Mixe:   ${mixes.length}${manualMixes.length ? ` (DAVON ${manualMixes.length} MANUELL → Dokument wird NICHT gelöscht!)` : ''}`
        );

        if (!EXECUTE) continue;
        if (manualMixes.length > 0) continue; // manuell nachbearbeitete Einträge nie anfassen

        // 1. Datei aus Storage löschen (Fehler nicht fatal — DB-Eintrag trotzdem entfernen)
        try {
            await deleteFile(d.file_path);
        } catch (e: any) {
            console.warn(`        Datei-Löschung fehlgeschlagen (ignoriert): ${e.message}`);
        }

        // 2. Dokument löschen → energy_mix + hkn_origins via ON DELETE CASCADE
        await query('DELETE FROM documents WHERE id = ?', [d.id]);

        // 3. Job auf failed setzen, damit der Provider beim nächsten Batch erneut gescrapt wird
        if (d.job_id) {
            await query(
                `UPDATE scrape_jobs SET status = 'failed',
                        log_message = 'Bereinigt: Dokument stammte von fremdem Anbieter (' || ? || ')'
                 WHERE id = ? AND status IN ('success', 'partial')`,
                [d.source_url.substring(0, 150), d.job_id]
            );
        }
        console.log('        ✔ gelöscht');
    }

    if (!EXECUTE) {
        console.log('\nDry-Run — nichts gelöscht. Mit --execute ausführen.');
    } else {
        console.log('\nBereinigung abgeschlossen.');
    }
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
