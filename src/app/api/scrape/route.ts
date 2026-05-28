import { NextResponse } from 'next/server';
import { runScrapeJob } from '@/lib/scraper/runner';
import { query } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';
import { scrapeRequestSchema, ScrapeRequestInput } from '@/lib/validations/scrape';
import { handleApiError, validateRequest, errorResponse } from '@/lib/validations/error-handler';

/**
 * POST /api/scrape — Start a scrape job for a provider.
 * Body: { providerId: number, providerName: string, url?: string }
 *
 * The job runs asynchronously (fire-and-forget).
 * Use GET /api/scrape?jobId=X to check the status.
 */
export async function POST(request: Request) {
    try {
        // Rate limit: max 10 scrape starts per minute
        const rl = checkRateLimit('scrape-post', 10, 60_000);
        if (!rl.success) {
            return errorResponse(
                `Zu viele Anfragen. Bitte ${rl.retryAfter}s warten.`,
                429,
                { retryAfter: rl.retryAfter },
                'RATE_LIMIT_EXCEEDED'
            );
        }

        // Validate request body with Zod
        const { providerId, providerName, url } = await validateRequest<ScrapeRequestInput>(
            request,
            scrapeRequestSchema
        );

        // Check if another scrape job is already running
        const batchStatus: any[] = await query('SELECT is_running FROM batch_status WHERE id = 1');
        if (batchStatus.length > 0 && batchStatus[0].is_running) {
            return NextResponse.json({ error: 'Ein anderer Scrape-Job läuft bereits. Bitte warten.' }, { status: 409 });
        }

        // Set batch_status to active for this single job so the terminal can poll it
        await query(
            'UPDATE batch_status SET is_running = TRUE, current_index = 1, total = 1, current_provider = ? WHERE id = 1',
            [providerName]
        );

        // Fire and forget — don't block the HTTP response
        // Log errors but don't propagate to the client
        runScrapeJob(providerId, providerName, url)
            .catch((err) => {
                console.error(`[API] Background scrape failed for ${providerName}:`, err.message);
            })
            .finally(async () => {
                // Reset batch status after the single job completes
                await query(
                    'UPDATE batch_status SET is_running = FALSE, current_index = 0, total = 0, current_provider = NULL WHERE id = 1'
                ).catch((e) => {
                    console.error('[API] Failed to reset batch status:', e.message);
                });
            });

        return NextResponse.json({
            success: true,
            message: `Job gestartet für ${providerName}. Status wird live im Dashboard aktualisiert.`,
        });
    } catch (error: unknown) {
        return handleApiError(error);
    }
}

/**
 * GET /api/scrape?jobId=X — Check the status of a scrape job.
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const jobId = searchParams.get('jobId');

        if (!jobId) {
            return NextResponse.json({ error: 'Missing jobId parameter' }, { status: 400 });
        }

        const rows: any[] = await query(
            `SELECT j.*, p.name as provider_name 
             FROM scrape_jobs j 
             JOIN providers p ON j.provider_id = p.id 
             WHERE j.id = ?`,
            [jobId]
        );

        if (rows.length === 0) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        return NextResponse.json(rows[0]);
    } catch (error: any) {
        console.error('[API] Status check error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
