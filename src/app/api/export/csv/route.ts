import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * GET /api/export/csv — Export provider data as CSV
 *
 * Query parameters (all optional):
 *   search - Text search (name, city, zip, file_number)
 *   status - Job status filter (success, failed, running, partial, never)
 *   data   - Data filter (with_data, no_data, low_confidence)
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const search = searchParams.get('search')?.trim() || '';
        const status = searchParams.get('status') || 'all';
        const data = searchParams.get('data') || 'all';
        const review = searchParams.get('review') || 'all';

        // Query all providers with latest energy mix data
        const providerSql = `
            SELECT DISTINCT
                p.id,
                p.name,
                p.city,
                p.zip,
                p.file_number,
                p.priority,
                p.review_status,
                p.active,
                (SELECT status FROM scrape_jobs WHERE provider_id = p.id ORDER BY id DESC LIMIT 1) as latest_job_status,
                (SELECT COUNT(*) FROM documents WHERE provider_id = p.id) as document_count,
                (SELECT year FROM energy_mix em
                 WHERE em.provider_id = p.id
                 ORDER BY em.id DESC LIMIT 1) as last_mix_year,
                (SELECT renewable_percentage FROM energy_mix em
                 WHERE em.provider_id = p.id
                 ORDER BY em.id DESC LIMIT 1) as last_renewable_percentage,
                (SELECT fossil_percentage FROM energy_mix em
                 WHERE em.provider_id = p.id
                 ORDER BY em.id DESC LIMIT 1) as last_fossil_percentage,
                (SELECT nuclear_percentage FROM energy_mix em
                 WHERE em.provider_id = p.id
                 ORDER BY em.id DESC LIMIT 1) as last_nuclear_percentage,
                (SELECT co2_emission_g_kwh FROM energy_mix em
                 WHERE em.provider_id = p.id
                 ORDER BY em.id DESC LIMIT 1) as co2_emission_g_kwh,
                (SELECT confidence FROM energy_mix em
                 WHERE em.provider_id = p.id
                 ORDER BY em.id DESC LIMIT 1) as last_confidence,
                (SELECT extraction_method FROM energy_mix em
                 WHERE em.provider_id = p.id
                 ORDER BY em.id DESC LIMIT 1) as last_extraction_method
            FROM providers p
            ORDER BY p.priority DESC, p.id ASC
        `;

        let providers: any[] = await query(providerSql);

        // Apply filters (same logic as DashboardClient)
        if (search) {
            const q = search.toLowerCase();
            providers = providers.filter(
                (p: any) =>
                    (p.name || '').toLowerCase().includes(q) ||
                    (p.city || '').toLowerCase().includes(q) ||
                    (p.zip || '').toString().includes(q) ||
                    (p.file_number || '').toLowerCase().includes(q)
            );
        }

        if (status !== 'all') {
            if (status === 'never') {
                providers = providers.filter((p: any) => !p.latest_job_status);
            } else {
                providers = providers.filter((p: any) => p.latest_job_status === status);
            }
        }

        if (data === 'with_data') {
            providers = providers.filter((p: any) => p.last_mix_year);
        } else if (data === 'no_data') {
            providers = providers.filter((p: any) => !p.last_mix_year);
        } else if (data === 'low_confidence') {
            providers = providers.filter((p: any) => p.last_confidence !== null && p.last_confidence < 40);
        }

        if (review !== 'all') {
            providers = providers.filter((p: any) => (p.review_status || 'offen') === review);
        }

        // Build CSV content
        const csvSafe = (val: string) => {
            const s = (val || '').replace(/"/g, '""');
            if (/^[=+\-@\t\r]/.test(s)) return `"'${s}"`;
            return `"${s}"`;
        };

        const csvHeader = [
            'Anbieter-ID',
            'Anbieter-Name',
            'Stadt',
            'PLZ',
            'Aktenzeichen',
            'Prioritaet',
            'Aktiv',
            'Jahr',
            'Erneuerbar %',
            'Fossil %',
            'Nuklear %',
            'CO2 (g/kWh)',
            'Konfidenz %',
            'Extraktionsmethode',
            'Letzter Job-Status',
            'Prüfstatus',
            'Dokumente',
        ].join(';');

        const statusLabels: Record<string, string> = {
            success: 'Erfolgreich',
            failed: 'Fehlgeschlagen',
            running: 'Laufend',
            partial: 'Teilweise',
            pending: 'Wartend',
        };

        const csvRows = providers.map((p: any) => {
            return [
                p.id,
                csvSafe(p.name),
                csvSafe(p.city),
                p.zip ?? '',
                p.file_number ?? '',
                p.priority ?? 50,
                p.active ? 'Ja' : 'Nein',
                p.last_mix_year ?? '',
                p.last_renewable_percentage ?? '',
                p.last_fossil_percentage ?? '',
                p.last_nuclear_percentage ?? '',
                p.co2_emission_g_kwh ?? '',
                p.last_confidence ?? '',
                p.last_extraction_method ?? '',
                statusLabels[p.latest_job_status] ?? 'Nie gescrapt',
                ({ offen: 'Offen', geprueft: 'Geprüft', beanstandet: 'Beanstandet' } as Record<string, string>)[
                    p.review_status
                ] || 'Offen',
                p.document_count ?? 0,
            ].join(';');
        });

        // BOM + content for correct Excel/German encoding
        const BOM = '\uFEFF';
        const csvContent = BOM + [csvHeader, ...csvRows].join('\n');

        // Generate filename with current date and filter hint
        const today = new Date().toISOString().split('T')[0];
        const filterHint = search || status !== 'all' || data !== 'all' || review !== 'all' ? '-gefiltert' : '';
        const filename = `skz-export${filterHint}-${today}.csv`;

        return new NextResponse(csvContent, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    } catch (error: any) {
        console.error('[API] CSV Export error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
