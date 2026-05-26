import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import {
    updateEnergyMixSchema,
    UpdateEnergyMixInput,
    energyMixIdSchema,
    EnergyMixIdParams,
} from '@/lib/validations/energy-mix';
import { handleApiError, validateRequest, validateParams } from '@/lib/validations/error-handler';

/**
 * PATCH /api/energy-mix/[id] — Update energy mix data
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        // Validate path params
        const { id } = validateParams<EnergyMixIdParams>(await params, energyMixIdSchema);

        // Validate request body
        const data = await validateRequest<UpdateEnergyMixInput>(request, updateEnergyMixSchema);

        console.log('[API] Updating energy_mix', id);

        // Get old values for audit
        const [oldRow]: any = await query(
            'SELECT year, renewable_percentage, fossil_percentage, nuclear_percentage, co2_emission_g_kwh, confidence, provider_id FROM energy_mix WHERE id = ?',
            [id]
        );

        // Build dynamic UPDATE query from validated data
        const updates: string[] = [];
        const values: any[] = [];

        // Exclude hkn_origins from UPDATE (handled separately)
        const { hkn_origins, ...updateFields } = data;

        for (const [key, value] of Object.entries(updateFields)) {
            if (value !== undefined) {
                updates.push(`${key} = ?`);
                values.push(value);
            }
        }

        if (updates.length === 0 && !hkn_origins) {
            return NextResponse.json({ error: 'Keine Aenderungen angegeben' }, { status: 400 });
        }

        // Update energy_mix table if there are field changes
        if (updates.length > 0) {
            values.push(id);
            await query(`UPDATE energy_mix SET ${updates.join(', ')} WHERE id = ?`, values);
        }

        // Update HKN origins if provided (replace strategy)
        if (hkn_origins !== undefined) {
            await query('DELETE FROM hkn_origins WHERE energy_mix_id = ?', [id]);
            if (hkn_origins && hkn_origins.length > 0) {
                for (const origin of hkn_origins) {
                    await query('INSERT INTO hkn_origins (energy_mix_id, country, percentage) VALUES (?, ?, ?)', [
                        id,
                        origin.country,
                        origin.percentage,
                    ]);
                }
            }
        }

        // Audit
        await logAudit(
            'update',
            'energy_mix',
            id,
            oldRow?.provider_id ?? null,
            `Energy-Mix #${id} bearbeitet`,
            oldRow
                ? {
                      year: oldRow.year,
                      ee: oldRow.renewable_percentage,
                      fo: oldRow.fossil_percentage,
                      nu: oldRow.nuclear_percentage,
                  }
                : null,
            {
                year: data.year,
                renewable_percentage: data.renewable_percentage,
                fossil_percentage: data.fossil_percentage,
                nuclear_percentage: data.nuclear_percentage,
            }
        );

        return NextResponse.json({ success: true, message: 'Energy-Mix aktualisiert' });
    } catch (error: unknown) {
        return handleApiError(error);
    }
}

/**
 * DELETE /api/energy-mix/[id] — Delete energy mix entry
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        // Validate path params
        const { id } = validateParams<EnergyMixIdParams>(await params, energyMixIdSchema);

        // Get old values for audit before deleting
        const [oldRow]: any = await query(
            'SELECT year, renewable_percentage, fossil_percentage, nuclear_percentage, provider_id FROM energy_mix WHERE id = ?',
            [id]
        );

        await query('DELETE FROM energy_mix WHERE id = ?', [id]);

        // Audit
        if (oldRow) {
            await logAudit(
                'delete',
                'energy_mix',
                id,
                oldRow.provider_id,
                `Energy-Mix #${id} geloescht (Jahr ${oldRow.year}, EE ${oldRow.renewable_percentage}%)`,
                {
                    year: oldRow.year,
                    ee: oldRow.renewable_percentage,
                    fo: oldRow.fossil_percentage,
                    nu: oldRow.nuclear_percentage,
                },
                null
            );
        }

        return NextResponse.json({ success: true, message: 'Energy-Mix geloescht' });
    } catch (error: unknown) {
        return handleApiError(error);
    }
}
