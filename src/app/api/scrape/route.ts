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

        // Fire and forget — don't block the HTTP response
        // Log errors but don't propagate to the client
        runScrapeJob(providerId, providerName, url).catch((err) => {
            console.error(`[API] Background scrape failed for ${providerName}:`, err.message);
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
