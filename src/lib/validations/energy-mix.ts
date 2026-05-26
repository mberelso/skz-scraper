import { z } from 'zod';
import {
    positiveInt,
    yearSchema,
    nullablePercentageSchema,
    confidenceSchema,
    extractionMethodSchema,
    mixTypeSchema,
    hknOriginsArraySchema,
} from './common';

/**
 * Energy Mix validation schemas
 */

// POST /api/energy-mix
export const createEnergyMixSchema = z.object({
    provider_id: positiveInt,
    document_id: positiveInt.nullable().optional(),
    year: yearSchema,
    renewable_percentage: nullablePercentageSchema.optional(),
    fossil_percentage: nullablePercentageSchema.optional(),
    nuclear_percentage: nullablePercentageSchema.optional(),
    // Renewable breakdown (by source)
    wind_percentage: nullablePercentageSchema.optional(),
    solar_percentage: nullablePercentageSchema.optional(),
    biomass_percentage: nullablePercentageSchema.optional(),
    hydro_percentage: nullablePercentageSchema.optional(),
    other_renewable_percentage: nullablePercentageSchema.optional(),
    // Renewable breakdown (by funding)
    eeg_funded_percentage: nullablePercentageSchema.optional(),
    hkn_percentage: nullablePercentageSchema.optional(),
    mieterstrom_percentage: nullablePercentageSchema.optional(),
    // Fossil breakdown
    coal_percentage: nullablePercentageSchema.optional(),
    natural_gas_percentage: nullablePercentageSchema.optional(),
    other_fossil_percentage: nullablePercentageSchema.optional(),
    // Environmental impact
    co2_emission_g_kwh: z.number().min(0).nullable().optional(),
    radioactive_waste_mg_kwh: z.number().min(0).nullable().optional(),
    // Meta
    eeg_percentage: nullablePercentageSchema.optional(),
    tariff_name: z.string().max(255).nullable().optional(),
    confidence: confidenceSchema.nullable().optional(),
    extraction_method: extractionMethodSchema.nullable().optional(),
    mix_type: mixTypeSchema.nullable().optional(),
    hkn_origins: hknOriginsArraySchema,
});

// PATCH /api/energy-mix/[id]
export const updateEnergyMixSchema = createEnergyMixSchema.omit({ provider_id: true, document_id: true }).partial();

// Path param validation
export const energyMixIdSchema = z.object({
    id: z.string().regex(/^\d+$/).transform(Number),
});

export type CreateEnergyMixInput = z.infer<typeof createEnergyMixSchema>;
export type UpdateEnergyMixInput = z.infer<typeof updateEnergyMixSchema>;
export type EnergyMixIdParams = z.infer<typeof energyMixIdSchema>;
