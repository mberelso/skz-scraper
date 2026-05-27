import { describe, it, expect } from 'vitest';
import { normalizeNameForMatching } from './matching-helper';

describe('normalizeNameForMatching', () => {
    it('sollte GmbH, AG und Sonderzeichen entfernen', () => {
        expect(normalizeNameForMatching('AggerEnergie GmbH')).toBe('aggerenergie');
        expect(normalizeNameForMatching('Adolf Roth GmbH & Co. KG')).toBe('adolfroth');
        expect(normalizeNameForMatching('Stadtwerke Leipzig AG')).toBe('stadtwerkeleipzig');
    });
});
