import { query } from '@/lib/db';
import { DetailedEnergyMix } from '@/lib/parser/ai-extractor';

/**
 * Shared: Validate and save extracted energy mix data to DB.
 * Handles validation, INSERT, hkn_origins, and logging.
 * Returns the extracted year on success, null on failure.
 */
export async function validateAndSaveMix(
    mix: DetailedEnergyMix,
    documentId: number,
    providerId: number,
    jobId: number,
    logPrefix: string,
    successMsg: string
): Promise<number | null> {
    const sum = (mix.renewable ?? 0) + (mix.fossil ?? 0) + (mix.nuclear ?? 0);
    const warnings: string[] = [];

    if (mix.renewable === mix.fossil && mix.fossil === mix.nuclear && mix.renewable > 0) {
        warnings.push(`EE=FO=NU=${mix.renewable}% (identisch)`);
        mix.confidence = Math.min(mix.confidence, 10);
    }
    if (sum > 0 && Math.abs(sum - 100) > 5) {
        warnings.push(`Summe=${sum.toFixed(1)}%`);
        mix.confidence = Math.min(mix.confidence, 20);
    }
    if (mix.nuclear > 5 && mix.year >= 2024) {
        warnings.push(`Nuklear=${mix.nuclear}% nach Atomausstieg`);
        mix.confidence = Math.min(mix.confidence, 30);
    }
    if (mix.renewable > 100 || mix.fossil > 100 || mix.nuclear > 100) {
        warnings.push(`Wert >100%`);
        mix.confidence = Math.min(mix.confidence, 5);
    }

    if (warnings.length > 0) {
        console.warn(`  [VALIDATE ${logPrefix}] ⚠️ ${warnings.join('; ')}`);
    }

    if (sum > 150) {
        console.error(`  [VALIDATE ${logPrefix}] ❌ Summe ${sum.toFixed(1)}% > 150% — verworfen`);
        await updateJobLog(jobId, `Extraktion verworfen: Summe=${sum.toFixed(1)}% (>150%)`);
        return null;
    }

    console.log(`  [${logPrefix}] ✅ Data found (method: ${mix.extraction_method}, confidence: ${mix.confidence}%)`);
    console.log(
        `  [${logPrefix}]    Year: ${mix.year} | RE: ${mix.renewable}% | Fossil: ${mix.fossil}% | Nuclear: ${mix.nuclear}% | Sum: ${sum.toFixed(1)}%`
    );

    try {
        const insertResult: any = await query(
            `INSERT INTO energy_mix (
                document_id, provider_id, year,
                renewable_percentage, fossil_percentage, nuclear_percentage,
                wind_percentage, solar_percentage, biomass_percentage, hydro_percentage, other_renewable_percentage,
                coal_percentage, natural_gas_percentage, other_fossil_percentage,
                eeg_funded_percentage, hkn_percentage, mieterstrom_percentage,
                co2_emission_g_kwh, radioactive_waste_mg_kwh,
                eeg_percentage, tariff_name, confidence, extraction_method, mix_type
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                documentId,
                providerId,
                mix.year,
                mix.renewable,
                mix.fossil,
                mix.nuclear,
                mix.wind,
                mix.solar,
                mix.biomass,
                mix.hydro,
                mix.other_renewable,
                mix.coal,
                mix.natural_gas,
                mix.other_fossil,
                mix.eeg_funded ?? null,
                mix.hkn ?? null,
                mix.mieterstrom ?? null,
                mix.co2,
                mix.waste,
                mix.eeg_percentage,
                mix.tariff_name,
                mix.confidence,
                mix.extraction_method,
                mix.mix_type ?? null,
            ]
        );
        const mixId = Number(insertResult.insertId);

        // Save HKN origin countries if present
        if (mix.hkn_origins && mix.hkn_origins.length > 0) {
            for (const origin of mix.hkn_origins) {
                await query('INSERT INTO hkn_origins (energy_mix_id, country, percentage) VALUES (?, ?, ?)', [
                    mixId,
                    origin.country,
                    origin.percentage,
                ]);
            }
            console.log(`  [${logPrefix}] ${mix.hkn_origins.length} HKN-Herkunftsländer gespeichert`);
        }

        const validationNote = warnings.length > 0 ? ` ⚠️ ${warnings.join('; ')}` : '';
        console.log(`  [${logPrefix}] Mix data saved to DB.`);
        await updateJobLog(
            jobId,
            `${successMsg} (${mix.extraction_method}, ${mix.confidence}% Konfidenz)${validationNote}`
        );
        return mix.year ?? null;
    } catch (e: any) {
        if (e.code === 'ER_DUP_ENTRY') {
            console.warn(`  [${logPrefix}] Mix data already exists for this document.`);
        } else {
            console.error(`  [${logPrefix}] Failed to save: ${e.message}`);
        }
        return mix.year ?? null;
    }
}

/**
 * Helper: Update the log_message of a running job.
 */
export async function updateJobLog(jobId: number, message: string) {
    await query('UPDATE scrape_jobs SET log_message = ? WHERE id = ?', [message, jobId]);
}
