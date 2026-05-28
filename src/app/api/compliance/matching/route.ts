import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const yearStr = searchParams.get('year') || new Date().getFullYear().toString();
        const year = parseInt(yearStr);

        // Holen aller Provider
        const providers: any[] = await query(
            `SELECT p.id, p.name, p.file_number, pys.delivered_volume_mwh
             FROM providers p
             LEFT JOIN provider_yearly_stats pys ON p.id = pys.provider_id AND pys.year = ?
             WHERE p.active = true
             ORDER BY p.name ASC`,
            [year]
        );

        // Holen aller HKN-Entwertungen für dieses Jahr
        const cancellations: any[] = await query(
            `SELECT provider_id, country, amount_mwh
             FROM hkn_cancellations
             WHERE year = ?`,
            [year]
        );

        // Zusammenführen der Daten
        const results = providers.map((p) => {
            const providerCancellations = cancellations
                .filter((c) => c.provider_id === p.id)
                .map((c) => ({
                    country: c.country,
                    amount_mwh: parseFloat(c.amount_mwh),
                }));

            return {
                id: p.id,
                name: p.name,
                file_number: p.file_number,
                delivered_volume_mwh: p.delivered_volume_mwh ? parseFloat(p.delivered_volume_mwh) : 0,
                cancellations: providerCancellations,
            };
        });

        return NextResponse.json({ success: true, year, data: results });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const { provider_id, year, delivered_volume_mwh, cancellations } = await request.json();

        if (!provider_id || !year) {
            return NextResponse.json({ error: 'Missing provider_id or year' }, { status: 400 });
        }

        // 1. Liefermenge speichern/updaten (falls übergeben)
        if (delivered_volume_mwh !== undefined) {
            const volume = parseFloat(delivered_volume_mwh) || 0;
            await query(
                `INSERT INTO provider_yearly_stats (provider_id, year, delivered_volume_mwh)
                 VALUES (?, ?, ?)
                 ON CONFLICT (provider_id, year)
                 DO UPDATE SET delivered_volume_mwh = EXCLUDED.delivered_volume_mwh`,
                [provider_id, year, volume]
            );
        }

        // 2. HKN-Entwertungen speichern (falls übergeben)
        if (cancellations !== undefined && Array.isArray(cancellations)) {
            // Erst alle bestehenden HKNs für diesen Provider in diesem Jahr löschen
            await query(`DELETE FROM hkn_cancellations WHERE provider_id = ? AND year = ?`, [provider_id, year]);

            // Dann neue einfügen
            for (const c of cancellations) {
                if (c.country && c.amount_mwh !== undefined) {
                    const amount = parseFloat(c.amount_mwh) || 0;
                    if (amount > 0) {
                        await query(
                            `INSERT INTO hkn_cancellations (provider_id, year, country, amount_mwh)
                             VALUES (?, ?, ?, ?)
                             ON CONFLICT (provider_id, year, country)
                             DO UPDATE SET amount_mwh = EXCLUDED.amount_mwh`,
                            [provider_id, year, c.country.trim(), amount]
                        );
                    }
                }
            }
        }

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
