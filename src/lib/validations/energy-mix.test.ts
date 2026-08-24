import { describe, it, expect } from 'vitest';
import { validateEnergyMixPlausibility, estimateExpectedCo2 } from './energy-mix';

describe('validateEnergyMixPlausibility', () => {
    it('gibt isValid: true für einen perfekten Strommix zurück', () => {
        const mix = {
            renewable: 50,
            fossil: 40,
            nuclear: 10,
            year: 2022,
            co2: 350,
            wind: 20,
            solar: 15,
            biomass: 15,
            natural_gas: 40,
        };

        const result = validateEnergyMixPlausibility(mix);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('erzeugt einen Fehler wenn die Hauptkategoriensumme stark abweicht (> 2%)', () => {
        const mix = {
            renewable: 60,
            fossil: 50,
            nuclear: 10, // Summe = 120%
        };

        const result = validateEnergyMixPlausibility(mix);
        expect(result.isValid).toBe(false);
        expect(result.errors.some((e) => e.code === 'SUM_DEVIATION_ERROR')).toBe(true);
    });

    it('erzeugt eine Warnung wenn die Hauptkategoriensumme leicht abweicht (0.5% - 2%)', () => {
        const mix = {
            renewable: 50,
            fossil: 40.8,
            nuclear: 10, // Summe = 100.8%
        };

        const result = validateEnergyMixPlausibility(mix);
        expect(result.isValid).toBe(true);
        expect(result.warnings.some((w) => w.code === 'SUM_DEVIATION_MINOR')).toBe(true);
    });

    it('erzeugt einen Fehler wenn Unterkategorien die Hauptkategorie übersteigen', () => {
        const mix = {
            renewable: 40,
            fossil: 50,
            nuclear: 10,
            solar: 30,
            wind: 20, // EE Subsumme = 50% > 40%
        };

        const result = validateEnergyMixPlausibility(mix);
        expect(result.isValid).toBe(false);
        expect(result.errors.some((e) => e.code === 'EE_SUBCATEGORIES_EXCEED_PARENT')).toBe(true);
    });

    it('erzeugt eine Warnung wenn Kernenergie in Deutschland nach 2023 gemeldet wird', () => {
        const mix = {
            renewable: 60,
            fossil: 35,
            nuclear: 5,
            year: 2023,
        };

        const result = validateEnergyMixPlausibility(mix);
        expect(result.isValid).toBe(true);
        expect(result.warnings.some((w) => w.code === 'NUCLEAR_AFTER_PHASEOUT')).toBe(true);
    });
});

describe('estimateExpectedCo2', () => {
    it('berechnet die CO2-Intensität korrekterweise gewichtet', () => {
        const mix = {
            renewable: 100,
            fossil: 0,
            nuclear: 0,
            wind: 100,
        };

        const co2 = estimateExpectedCo2(mix);
        expect(co2).toBe(12); // EMISSION_FACTORS.wind = 12
    });
});
