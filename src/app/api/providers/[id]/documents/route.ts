import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * GET /api/providers/{id}/documents — Alle Dokumente + energy_mix eines Providers.
 * Sortiert nach reporting_year DESC.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const providerId = Number(id);
        if (!providerId || isNaN(providerId)) {
            return NextResponse.json({ error: 'Invalid provider ID' }, { status: 400 });
        }

        // Alle Dokumente + energy_mix (inkl. manuelle Einträge ohne Dokument)
        const documents: any[] = await query(
            `
            SELECT
                d.id,
                d.file_type,
                d.file_path,
                d.source_url,
                d.original_filename,
                d.reporting_year,
                d.created_at,
                COALESCE(d.reporting_year, em.year) as sort_year,
                em.id as mix_id,
                em.year as mix_year,
                em.renewable_percentage,
                em.fossil_percentage,
                em.nuclear_percentage,
                em.eeg_funded_percentage,
                em.hkn_percentage,
                em.mieterstrom_percentage,
                em.co2_emission_g_kwh,
                em.radioactive_waste_mg_kwh,
                em.confidence,
                em.extraction_method,
                em.tariff_name,
                em.mix_type
            FROM documents d
            LEFT JOIN energy_mix em ON em.document_id = d.id
            WHERE d.provider_id = ?

            UNION ALL

            SELECT
                NULL as id,
                'manual' as file_type,
                NULL as file_path,
                NULL as source_url,
                NULL as original_filename,
                em.year as reporting_year,
                em.created_at,
                em.year as sort_year,
                em.id as mix_id,
                em.year as mix_year,
                em.renewable_percentage,
                em.fossil_percentage,
                em.nuclear_percentage,
                em.eeg_funded_percentage,
                em.hkn_percentage,
                em.mieterstrom_percentage,
                em.co2_emission_g_kwh,
                em.radioactive_waste_mg_kwh,
                em.confidence,
                em.extraction_method,
                em.tariff_name,
                em.mix_type
            FROM energy_mix em
            WHERE em.provider_id = ? AND em.document_id IS NULL

            ORDER BY sort_year DESC, created_at DESC
        `,
            [providerId, providerId]
        );

        // Load HKN origins for all mix entries
        const mixIds = documents.filter((d) => d.mix_id).map((d) => d.mix_id);
        const hknMap: Record<number, { country: string; percentage: number }[]> = {};
        if (mixIds.length > 0) {
            const hknRows: any[] = await query(
                `SELECT energy_mix_id, country, percentage FROM hkn_origins WHERE energy_mix_id IN (${mixIds.map(() => '?').join(',')}) ORDER BY percentage DESC`,
                mixIds
            );
            for (const row of hknRows) {
                const id = row.energy_mix_id;
                if (!hknMap[id]) hknMap[id] = [];
                hknMap[id].push({ country: row.country, percentage: Number(row.percentage) });
            }
        }

        // Attach hkn_origins to documents
        const result = documents.map((d) => ({
            ...d,
            hkn_origins: d.mix_id ? hknMap[d.mix_id] || null : null,
        }));

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('[API] Provider documents error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
