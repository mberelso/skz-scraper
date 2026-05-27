import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { calculateDeviation } from '@/lib/parser/compliance-engine';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const yearStr = searchParams.get('year') || new Date().getFullYear().toString();
        const year = parseInt(yearStr);

        // Get constants
        const constantsRows: any[] = await query('SELECT * FROM federal_constants WHERE year = ?', [year]);
        const constants = constantsRows[0] || null;

        // Query providers with merged SKZ and Cancellation stats
        const auditRows: any[] = await query(
            `SELECT 
                p.id as provider_id,
                p.name as provider_name,
                p.file_number,
                em.hkn_percentage,
                em.eeg_percentage,
                em.renewable_percentage,
                pys.delivered_volume_mwh,
                COALESCE(ca.status, 'offen') as audit_status,
                ca.audit_note,
                ca.audited_by,
                ca.audited_at
            FROM providers p
            LEFT JOIN provider_yearly_stats pys ON p.id = pys.provider_id AND pys.year = ?
            LEFT JOIN documents d ON p.id = d.provider_id AND d.reporting_year = ? AND d.file_type = 'pdf'
            LEFT JOIN energy_mix em ON d.id = em.document_id
            LEFT JOIN compliance_audits ca ON p.id = ca.provider_id AND ca.year = ?
            WHERE p.active = true`,
            [year, year, year]
        );

        const results = [];

        for (const row of auditRows) {
            const hknPercent = parseFloat(row.hkn_percentage || '0');
            const volume = parseFloat(row.delivered_volume_mwh || '0');
            const sollMwh = (hknPercent / 100) * volume;

            // Sum cancellations
            const cancelRows: any[] = await query(
                'SELECT SUM(amount_mwh) as total FROM hkn_cancellations WHERE provider_id = ? AND year = ?',
                [row.provider_id, year]
            );
            const istMwh = parseFloat(cancelRows[0]?.total || '0');

            const dev = calculateDeviation(sollMwh, istMwh);

            // Percentage point diff in mix
            const calculatedMixHkn = volume > 0 ? (istMwh / volume) * 100 : 0;
            const mixPointDiff = parseFloat((calculatedMixHkn - hknPercent).toFixed(2));

            results.push({
                provider_id: row.provider_id,
                provider_name: row.provider_name,
                file_number: row.file_number,
                delivered_volume_mwh: volume,
                hkn_percentage: hknPercent,
                eeg_percentage: parseFloat(row.eeg_percentage || '0'),
                renewable_percentage: parseFloat(row.renewable_percentage || '0'),
                soll_mwh: sollMwh,
                ist_mwh: istMwh,
                deviation_percent: dev.deviationPercent,
                difference_mwh: dev.differenceMwh,
                mix_point_diff: mixPointDiff,
                audit_status: row.audit_status,
                audit_note: row.audit_note,
                audited_by: row.audited_by,
                audited_at: row.audited_at,
            });
        }

        return NextResponse.json({ success: true, year, constants, audits: results });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const { provider_id, year, status, audit_note, audited_by } = await request.json();
        if (!provider_id || !year || !status) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        await query(
            `INSERT INTO compliance_audits (provider_id, year, status, audit_note, audited_by, audited_at)
            VALUES (?, ?, ?, ?, ?, NOW())
            ON CONFLICT (provider_id, year) 
            DO UPDATE SET status = EXCLUDED.status, audit_note = EXCLUDED.audit_note, audited_by = EXCLUDED.audited_by, audited_at = NOW()`,
            [provider_id, year, status, audit_note, audited_by]
        );

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
