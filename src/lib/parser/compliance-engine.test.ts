import { describe, it, expect } from 'vitest';
import { calculateDeviation } from './compliance-engine';

describe('calculateDeviation', () => {
    it('sollte HKN Mengenabweichung in Prozent korrekt berechnen', () => {
        // Soll: 4000 MWh, Ist: 3600 MWh
        const res = calculateDeviation(4000, 3600);
        expect(res.deviationPercent).toBe(-10.0);
        expect(res.differenceMwh).toBe(-400.0);
    });

    it('sollte HKN Mengenabweichung bei 0 Soll-Menge handhaben', () => {
        const res = calculateDeviation(0, 50);
        expect(res.deviationPercent).toBe(0);
        expect(res.differenceMwh).toBe(50);
    });
});
