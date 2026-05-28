import { NextResponse } from 'next/server';
import { runScrapeJob } from '@/lib/scraper/runner';
import { query } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';

const DELAY_BETWEEN_JOBS_MS = 8000;
const JOB_TIMEOUT_MS = 120_000; // 2 Minuten max pro Job

// --- DB-basierter Batch-Status (überlebt Turbopack-Reloads + Server-Neustarts) ---

async function getBatchStatus() {
    const rows: any[] = await query('SELECT * FROM batch_status WHERE id = 1');
    if (rows.length === 0) {
        return { isRunning: false, current: 0, total: 0, currentProvider: null };
    }
    const r = rows[0];
    return {
        isRunning: !!r.is_running,
        current: r.current_index,
        total: r.total,
        currentProvider: r.current_provider,
    };
}

async function updateBatchStatus(isRunning: boolean, current: number, total: number, currentProvider: string | null) {
    await query(
        'UPDATE batch_status SET is_running = ?, current_index = ?, total = ?, current_provider = ? WHERE id = 1',
        [isRunning, current, total, currentProvider]
    );
}

/**
 * POST /api/scrape-batch?limit=50 — Sequenzieller Batch-Scrape aktiver Provider.
 */
export async function POST(request: Request) {
    try {
        // Rate limit: max 5 batch starts per minute
        const rl = checkRateLimit('batch-post', 5, 60_000);
        if (!rl.success) {
            return NextResponse.json(
                { error: `Zu viele Anfragen. Bitte ${rl.retryAfter}s warten.` },
                { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
            );
        }

        // Check if already running
        const status = await getBatchStatus();
        if (status.isRunning) {
            return NextResponse.json({ error: 'Batch läuft bereits' }, { status: 409 });
        }

        const body = await request.json().catch(() => ({}));
        const providerIds = body.providerIds;

        const { searchParams } = new URL(request.url);
        const limitParam = searchParams.get('limit');
        const limit = limitParam ? parseInt(limitParam, 10) : undefined;

        let providers: any[] = [];

        if (Array.isArray(providerIds) && providerIds.length > 0) {
            // Fetch only specified providers, preserving priority ordering
            const placeholders = providerIds.map(() => '?').join(',');
            const sql = `
                SELECT id, name, priority 
                FROM providers 
                WHERE id IN (${placeholders})
                ORDER BY priority DESC, id ASC
            `;
            providers = await query(sql, providerIds);
        } else if (limit) {
            const sql = `
                SELECT p.id, p.name, p.priority
                FROM providers p
                LEFT JOIN (
                    SELECT provider_id, MAX(id) as latest_job_id
                    FROM scrape_jobs
                    GROUP BY provider_id
                ) latest ON p.id = latest.provider_id
                LEFT JOIN scrape_jobs j ON latest.latest_job_id = j.id
                WHERE p.active = TRUE
                AND (j.status IS NULL OR j.status != 'success')
                ORDER BY p.priority DESC, p.id ASC
                LIMIT ${limit}
            `;
            providers = await query(sql);
        } else {
            const sql = 'SELECT id, name FROM providers WHERE active = TRUE ORDER BY priority DESC, id ASC';
            providers = await query(sql);
        }

        if (providers.length === 0) {
            return NextResponse.json({ error: 'Keine aktiven Provider gefunden' }, { status: 400 });
        }

        // Cleanup stuck jobs before starting
        await query(
            `UPDATE scrape_jobs SET status = 'failed', log_message = CONCAT(COALESCE(log_message,''), ' | Abgebrochen (Batch-Start)'), finished_at = NOW() WHERE status = 'running'`
        );

        // Initialize batch status in DB
        await updateBatchStatus(true, 0, providers.length, null);

        // Fire and forget
        processBatchInBackground(providers).catch(async (err) => {
            console.error('[BATCH] Background processing failed:', err.message);
            await updateBatchStatus(false, 0, 0, null).catch(() => {});
        });

        return NextResponse.json({
            success: true,
            message: `Batch-Scrape gestartet für ${providers.length} Provider. Jobs laufen sequenziell im Hintergrund.`,
            providerCount: providers.length,
        });
    } catch (error: any) {
        console.error('[BATCH] API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * GET /api/scrape-batch — Get current batch status from DB.
 */
export async function GET(_request: Request) {
    try {
        const status = await getBatchStatus();
        const recentJobs = await query(`
            SELECT j.id, j.provider_id, p.name as provider_name, j.status, j.log_message, j.started_at, j.finished_at
            FROM scrape_jobs j
            JOIN providers p ON j.provider_id = p.id
            ORDER BY j.id DESC LIMIT 15
        `);
        return NextResponse.json({
            ...status,
            recentJobs: JSON.parse(
                JSON.stringify(recentJobs, (_key, value) => (typeof value === 'bigint' ? Number(value) : value))
            ),
        });
    } catch (error: any) {
        return NextResponse.json({ isRunning: false, current: 0, total: 0, currentProvider: null, recentJobs: [] });
    }
}

/**
 * DELETE /api/scrape-batch — Stop the currently running batch.
 */
export async function DELETE(_request: Request) {
    try {
        console.log('[BATCH] ⛔ Stop requested by user');
        await updateBatchStatus(false, 0, 0, null);
        return NextResponse.json({
            success: true,
            message: 'Batch-Stop angefordert. Aktueller Job wird fertiggestellt.',
        });
    } catch (error: any) {
        console.error('[BATCH] Stop error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * Background worker: Processes all providers sequentially with delays.
 * Reads stop flag from DB before each job. Each job has a 2-minute timeout.
 */
async function processBatchInBackground(providers: any[]) {
    console.log(`\n=== BATCH SCRAPE STARTED: ${providers.length} providers ===\n`);

    for (let i = 0; i < providers.length; i++) {
        // Check stop flag from DB before each job
        const status = await getBatchStatus();
        if (!status.isRunning) {
            console.log(`\n[BATCH] ⛔ STOPPED by user request after ${i} job(s)\n`);
            break;
        }

        const provider = providers[i];

        // Update progress in DB
        await updateBatchStatus(true, i + 1, providers.length, provider.name);

        console.log(`[BATCH ${i + 1}/${providers.length}] Starting: ${provider.name}`);

        try {
            // Job-Timeout: max 2 Minuten pro Provider
            await Promise.race([
                runScrapeJob(provider.id, provider.name),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Timeout nach 2 Min.')), JOB_TIMEOUT_MS)
                ),
            ]);
            console.log(`[BATCH ${i + 1}/${providers.length}] ✅ Completed: ${provider.name}`);
        } catch (err: any) {
            console.error(`[BATCH ${i + 1}/${providers.length}] ❌ Failed: ${provider.name} — ${err.message}`);
            // Mark timed-out jobs as failed in DB
            if (err.message.includes('Timeout')) {
                await query(
                    `UPDATE scrape_jobs SET status = 'failed', log_message = 'Timeout nach 2 Min.', finished_at = NOW() WHERE provider_id = ? AND status = 'running'`,
                    [provider.id]
                ).catch(() => {});
            }
        }

        // Re-check stop flag before delay
        const afterStatus = await getBatchStatus();
        if (!afterStatus.isRunning) break;

        // Delay between jobs (except after the last one)
        if (i < providers.length - 1) {
            console.log(`[BATCH] Waiting ${DELAY_BETWEEN_JOBS_MS / 1000}s before next job...`);
            await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_JOBS_MS));
        }
    }

    console.log('\n=== BATCH SCRAPE COMPLETED ===\n');

    // Reset status in DB
    await updateBatchStatus(false, 0, 0, null);
}
