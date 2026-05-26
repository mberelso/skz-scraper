import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { createEnergyMixSchema, CreateEnergyMixInput } from '@/lib/validations/energy-mix';
import { handleApiError, validateRequest } from '@/lib/validations/error-handler';

/**
 * POST /api/energy-mix — Create new energy mix entry manually
 */
export async function POST(request: Request) {
    try {
        // Validate request body with Zod
        const data = await validateRequest<CreateEnergyMixInput>(request, createEnergyMixSchema);

        console.log('[API] Creating manual energy_mix for provider', data.provider_id);

        // Insert
        const result: any = await query(
            `INSERT INTO energy_mix (
                provider_id, document_id, year,
                renewable_percentage, fossil_percentage, nuclear_percentage,
                wind_percentage, solar_percentage, biomass_percentage, hydro_percentage, other_renewable_percentage,
                coal_percentage, natural_gas_percentage, other_fossil_percentage,
                eeg_funded_percentage, hkn_percentage, mieterstrom_percentage,
                co2_emission_g_kwh, radioactive_waste_mg_kwh,
                eeg_percentage, tariff_name, confidence, extraction_method
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                data.provider_id,
                data.document_id ?? null,
                data.year,
                data.renewable_percentage ?? null,
                data.fossil_percentage ?? null,
                data.nuclear_percentage ?? null,
                data.wind_percentage ?? null,
                data.solar_percentage ?? null,
                data.biomass_percentage ?? null,
                data.hydro_percentage ?? null,
                data.other_renewable_percentage ?? null,
                data.coal_percentage ?? null,
                data.natural_gas_percentage ?? null,
                data.other_fossil_percentage ?? null,
                data.eeg_funded_percentage ?? null,
                data.hkn_percentage ?? null,
                data.mieterstrom_percentage ?? null,
                data.co2_emission_g_kwh ?? null,
                data.radioactive_waste_mg_kwh ?? null,
                data.eeg_percentage ?? null,
                data.tariff_name ?? null,
                data.confidence ?? 100, // default for manual entries
                data.extraction_method ?? 'manual',
            ]
        );

        const newId = Number(result.insertId);

        // Save HKN origin countries if provided
        if (data.hkn_origins && data.hkn_origins.length > 0) {
            for (const origin of data.hkn_origins) {
                await query('INSERT INTO hkn_origins (energy_mix_id, country, percentage) VALUES (?, ?, ?)', [
                    newId,
                    origin.country,
                    origin.percentage,
                ]);
            }
        }

        // Update provider status to 'geprueft' when manual entry is created
        await query("UPDATE providers SET review_status = 'geprueft' WHERE id = ?", [data.provider_id]);

        await logAudit(
            'create',
            'energy_mix',
            newId,
            data.provider_id,
            `Manueller Eintrag: Jahr ${data.year}, EE ${data.renewable_percentage ?? '-'}%, FO ${data.fossil_percentage ?? '-'}%, NU ${data.nuclear_percentage ?? '-'}%`,
            null,
            {
                year: data.year,
                renewable_percentage: data.renewable_percentage,
                fossil_percentage: data.fossil_percentage,
                nuclear_percentage: data.nuclear_percentage,
                co2_emission_g_kwh: data.co2_emission_g_kwh,
                confidence: data.confidence,
            }
        );

        return NextResponse.json({
            success: true,
            message: 'Energy-Mix manuell erstellt',
            id: newId,
        });
    } catch (error: unknown) {
        return handleApiError(error);
    }
}
