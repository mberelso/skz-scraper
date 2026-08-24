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
 * Energy Mix validation schemas for API routes
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

/* ------------------------------------------------------------------ */
/* Plausibilitäts- & Validierungsschicht für KI-Extrakte              */
/* ------------------------------------------------------------------ */

export const SUM_TOLERANCE_ERROR = 2.0;
export const SUM_TOLERANCE_WARNING = 0.5;
const SUBCATEGORY_EPSILON = 0.5;

const CO2_ABS_TOLERANCE = 60; // g/kWh
const CO2_REL_TOLERANCE = 0.35; // 35% vom Erwartungswert

/** Lebenszyklus-Emissionsfaktoren (g CO₂/kWh) */
export const EMISSION_FACTORS = {
    solar: 43,
    wind: 12,
    hydro: 21,
    biomass: 210,
    other_renewable: 100,
    coal: 1000,
    natural_gas: 480,
    other_fossil: 750,
    nuclear: 12,
    other: 400,
} as const;

export interface ValidationIssue {
    code: string;
    path: string;
    message: string;
    severity: 'error' | 'warning';
    details?: Record<string, unknown>;
}

export interface ValidationResult {
    isValid: boolean;
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * Schätzt die erwartete CO2-Intensität (g/kWh) basierend auf den Energieträgeranteilen.
 */
export function estimateExpectedCo2(mix: {
    renewable: number;
    fossil: number;
    nuclear: number;
    solar?: number | null;
    wind?: number | null;
    hydro?: number | null;
    biomass?: number | null;
    other_renewable?: number | null;
    coal?: number | null;
    natural_gas?: number | null;
    other_fossil?: number | null;
}): number {
    let totalCo2 = 0;

    // EE-Aufschlüsselung oder Fallback-Durchschnitt
    const eeSubSum =
        (mix.solar ?? 0) + (mix.wind ?? 0) + (mix.hydro ?? 0) + (mix.biomass ?? 0) + (mix.other_renewable ?? 0);
    if (eeSubSum > 0 && mix.renewable > 0) {
        const scale = Math.min(1, mix.renewable / eeSubSum);
        totalCo2 += (mix.solar ?? 0) * scale * EMISSION_FACTORS.solar;
        totalCo2 += (mix.wind ?? 0) * scale * EMISSION_FACTORS.wind;
        totalCo2 += (mix.hydro ?? 0) * scale * EMISSION_FACTORS.hydro;
        totalCo2 += (mix.biomass ?? 0) * scale * EMISSION_FACTORS.biomass;
        totalCo2 += (mix.other_renewable ?? 0) * scale * EMISSION_FACTORS.other_renewable;
    } else {
        totalCo2 += mix.renewable * 50; // EE Durchschnitts-Emissionsfaktor
    }

    // Fossil-Aufschlüsselung oder Fallback-Durchschnitt
    const fossilSubSum = (mix.coal ?? 0) + (mix.natural_gas ?? 0) + (mix.other_fossil ?? 0);
    if (fossilSubSum > 0 && mix.fossil > 0) {
        const scale = Math.min(1, mix.fossil / fossilSubSum);
        totalCo2 += (mix.coal ?? 0) * scale * EMISSION_FACTORS.coal;
        totalCo2 += (mix.natural_gas ?? 0) * scale * EMISSION_FACTORS.natural_gas;
        totalCo2 += (mix.other_fossil ?? 0) * scale * EMISSION_FACTORS.other_fossil;
    } else {
        totalCo2 += mix.fossil * 700; // Fossil Durchschnitts-Emissionsfaktor
    }

    // Nuklear
    totalCo2 += mix.nuclear * EMISSION_FACTORS.nuclear;

    return round(totalCo2 / 100, 1);
}

/**
 * Validiert einen extrahierten Strommix auf mathematische Konsistenz & Plausibilität.
 */
export function validateEnergyMixPlausibility(mix: {
    renewable: number;
    fossil: number;
    nuclear: number;
    year?: number | null;
    co2?: number | null;
    solar?: number | null;
    wind?: number | null;
    hydro?: number | null;
    biomass?: number | null;
    other_renewable?: number | null;
    coal?: number | null;
    natural_gas?: number | null;
    other_fossil?: number | null;
}): ValidationResult {
    const errors: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];

    // 1) Hauptkategoriensumme ≈ 100%
    const total = round(mix.renewable + mix.fossil + mix.nuclear, 2);
    const deviation = round(Math.abs(total - 100), 2);

    if (deviation > SUM_TOLERANCE_ERROR) {
        errors.push({
            code: 'SUM_DEVIATION_ERROR',
            path: 'renewable,fossil,nuclear',
            message: `Hauptkategorien summieren sich auf ${total}% statt 100% (Abweichung ${deviation}% > Toleranz ${SUM_TOLERANCE_ERROR}%).`,
            severity: 'error',
            details: { total, deviation },
        });
    } else if (deviation > SUM_TOLERANCE_WARNING) {
        warnings.push({
            code: 'SUM_DEVIATION_MINOR',
            path: 'renewable,fossil,nuclear',
            message: `Hauptkategorien ergeben ${total}% – leichte Abweichung von ${deviation}%.`,
            severity: 'warning',
            details: { total, deviation },
        });
    }

    // 2) Unterkategorien ≤ Hauptkategorie (+SUBCATEGORY_EPSILON)
    const eeSubSum = round(
        (mix.solar ?? 0) + (mix.wind ?? 0) + (mix.hydro ?? 0) + (mix.biomass ?? 0) + (mix.other_renewable ?? 0),
        2
    );
    if (eeSubSum > mix.renewable + SUBCATEGORY_EPSILON) {
        errors.push({
            code: 'EE_SUBCATEGORIES_EXCEED_PARENT',
            path: 'renewable',
            message: `Summe der EE-Unterkategorien (${eeSubSum}%) übersteigt Erneuerbare Energien gesamt (${mix.renewable}%).`,
            severity: 'error',
            details: { eeSubSum, parent: mix.renewable },
        });
    }

    const fossilSubSum = round((mix.coal ?? 0) + (mix.natural_gas ?? 0) + (mix.other_fossil ?? 0), 2);
    if (fossilSubSum > mix.fossil + SUBCATEGORY_EPSILON) {
        errors.push({
            code: 'FOSSIL_SUBCATEGORIES_EXCEED_PARENT',
            path: 'fossil',
            message: `Summe der Fossil-Unterkategorien (${fossilSubSum}%) übersteigt Fossile Energieträger gesamt (${mix.fossil}%).`,
            severity: 'error',
            details: { fossilSubSum, parent: mix.fossil },
        });
    }

    // 3) CO2-Korridor
    if (typeof mix.co2 === 'number' && mix.co2 > 0) {
        const expected = estimateExpectedCo2(mix);
        const tol = Math.max(CO2_ABS_TOLERANCE, expected * CO2_REL_TOLERANCE);
        const delta = round(Math.abs(mix.co2 - expected), 1);
        if (delta > tol) {
            warnings.push({
                code: 'CO2_OUTSIDE_CORRIDOR',
                path: 'co2',
                message: `CO₂-Intensität (${mix.co2} g/kWh) weicht vom Erwartungswert (${expected} g/kWh) ab (Korridor: ±${round(tol, 0)} g/kWh).`,
                severity: 'warning',
                details: { reported: mix.co2, expected, delta, tolerance: round(tol, 1) },
            });
        }
    }

    // 4) Atomausstieg Deutschland (ab 2023 Kernenergie > 0)
    if (mix.nuclear > 0.5 && mix.year && mix.year >= 2023) {
        warnings.push({
            code: 'NUCLEAR_AFTER_PHASEOUT',
            path: 'nuclear',
            message: `Kernenergie-Anteil von ${mix.nuclear}% im Jahr ${mix.year} ist für Deutschland unplausibel (Atomausstieg April 2023).`,
            severity: 'warning',
            details: { year: mix.year, nuclear: mix.nuclear },
        });
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings,
    };
}
