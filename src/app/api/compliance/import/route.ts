import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { normalizeNameForMatching } from '@/lib/scraper/matching-helper';

export async function POST(request: Request) {
    try {
        const { csvData } = await request.json();
        if (!csvData) {
            return NextResponse.json({ error: 'No CSV data provided' }, { status: 400 });
        }

        const lines = csvData
            .split('\n')
            .map((line: string) => line.trim())
            .filter(Boolean);
        // Skip header
        const dataLines = lines.slice(1);

        let importedCount = 0;
        let failedCount = 0;
        const log: string[] = [];

        // Load all providers for matching cache
        const providers: any[] = await query('SELECT id, name FROM providers');
        const normalizedProviders = providers.map((p) => ({
            id: p.id,
            name: p.name,
            norm: normalizeNameForMatching(p.name),
        }));

        for (const line of dataLines) {
            const [anbieter_name, berichtsjahr, strommenge_mwh, hkn_land, hkn_menge_mwh] = line.split(',');
            if (!anbieter_name || !berichtsjahr || !strommenge_mwh || !hkn_land || !hkn_menge_mwh) {
                failedCount++;
                continue;
            }

            const normName = normalizeNameForMatching(anbieter_name);
            const matched = normalizedProviders.find((p) => p.norm === normName);

            if (!matched) {
                failedCount++;
                log.push(`Anbieter nicht gefunden: "${anbieter_name}"`);
                continue;
            }

            const year = parseInt(berichtsjahr);
            const volume = parseFloat(strommenge_mwh);
            const amount = parseFloat(hkn_menge_mwh);

            // 1. Save volume stats
            await query(
                `INSERT INTO provider_yearly_stats (provider_id, year, delivered_volume_mwh)
                 VALUES (?, ?, ?) ON CONFLICT (provider_id, year) DO UPDATE SET delivered_volume_mwh = EXCLUDED.delivered_volume_mwh`,
                [matched.id, year, volume]
            );

            // 2. Save HKN Cancellation
            await query(
                `INSERT INTO hkn_cancellations (provider_id, year, country, amount_mwh)
                 VALUES (?, ?, ?, ?) ON CONFLICT (provider_id, year, country) DO UPDATE SET amount_mwh = EXCLUDED.amount_mwh`,
                [matched.id, year, hkn_land.trim(), amount]
            );

            importedCount++;
        }

        return NextResponse.json({ success: true, importedCount, failedCount, log });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
