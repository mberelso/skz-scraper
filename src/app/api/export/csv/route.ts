import { NextRequest, NextResponse } from 'next/server';
import { queryExportData, generateCSV, ExportParams } from '@/lib/export';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const search = searchParams.get('search')?.trim() || '';
        const status = searchParams.get('status') || 'all';
        const data = searchParams.get('data') || 'all';
        const review = searchParams.get('review') || 'all';

        // Call SQL builder with filter mode
        const providers = await queryExportData({
            mode: 'filter',
            filters: {
                reviewStatus: review,
            },
        });

        // Handover search/status/data filtering (existing logic)
        let filtered = [...providers];
        if (search) {
            const q = search.toLowerCase();
            filtered = filtered.filter(
                (p: any) =>
                    (p.name || '').toLowerCase().includes(q) ||
                    (p.city || '').toLowerCase().includes(q) ||
                    (p.zip || '').toString().includes(q) ||
                    (p.file_number || '').toLowerCase().includes(q)
            );
        }
        if (status !== 'all') {
            if (status === 'never') {
                filtered = filtered.filter((p: any) => !p.latest_job_status);
            } else {
                filtered = filtered.filter((p: any) => p.latest_job_status === status);
            }
        }
        if (data === 'with_data') {
            filtered = filtered.filter((p: any) => p.last_mix_year);
        } else if (data === 'no_data') {
            filtered = filtered.filter((p: any) => !p.last_mix_year);
        } else if (data === 'low_confidence') {
            filtered = filtered.filter((p: any) => p.last_confidence !== null && p.last_confidence < 40);
        }

        const csvContent = generateCSV(filtered);
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
        console.error('[API] CSV GET Export error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body: ExportParams = await req.json();

        // Query data using decoupled helpers
        const providers = await queryExportData(body);
        const csvContent = generateCSV(providers);

        const today = new Date().toISOString().split('T')[0];
        const filename = `skz-export-custom-${today}.csv`;

        return new NextResponse(csvContent, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    } catch (error: any) {
        console.error('[API] CSV POST Export error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
