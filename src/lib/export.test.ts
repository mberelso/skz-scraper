import { describe, it, expect } from 'vitest';
import { generateCSV, generatePDFHtml } from './export';

describe('Export Utils', () => {
    it('should format a list of providers to CSV correctly', () => {
        const mockProviders = [
            {
                id: 1,
                name: 'Test-Versorger',
                city: 'Leipzig',
                zip: '04109',
                file_number: '123/456',
                priority: 80,
                active: true,
                last_mix_year: 2024,
                last_renewable_percentage: 60.5,
                last_fossil_percentage: 39.5,
                last_nuclear_percentage: 0,
                co2_emission_g_kwh: 350,
                last_confidence: 95,
                last_extraction_method: 'gemini',
                latest_job_status: 'success',
                review_status: 'geprueft',
                document_count: 2,
            },
        ];

        const csv = generateCSV(mockProviders);
        expect(csv).toContain('Test-Versorger');
        expect(csv).toContain('Leipzig');
        expect(csv).toContain('60.5;');
    });

    it('should generate a valid PDF HTML template containing provider info', () => {
        const mockProviders = [
            {
                id: 1,
                name: 'Test-Versorger',
                city: 'Leipzig',
                zip: '04109',
                last_mix_year: 2024,
                last_renewable_percentage: 60.5,
                last_fossil_percentage: 39.5,
                last_nuclear_percentage: 0,
                co2_emission_g_kwh: 350,
                latest_job_status: 'success',
                review_status: 'geprueft',
            },
        ];

        const html = generatePDFHtml(mockProviders, 2024);
        expect(html).toContain('Test-Versorger');
        expect(html).toContain('Stromkennzeichnungs-Bericht');
        expect(html).toContain('60.5%');
    });
});
