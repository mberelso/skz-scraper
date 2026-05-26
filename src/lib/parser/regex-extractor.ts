import { DetailedEnergyMix } from './ai-extractor';

/**
 * FALLBACK regex-based extractor for Stromkennzeichnung PDFs/HTML.
 * Uses keyword proximity matching to find energy mix percentages in raw text.
 *
 * IMPORTANT: German Stromkennzeichnung pages typically contain 3 sections:
 *   1. "Gesamtenergieträgermix des Unternehmens" (company total mix)
 *   2. "Unternehmensverkaufsmix" or product/tariff-specific mixes
 *   3. "Bundesmix Deutschland" (national average — NOT what we want)
 *
 * We extract from section 1 (or 2 if 1 is absent), and NEVER from Bundesmix.
 */
export function parseEnergyMix(text: string): DetailedEnergyMix | null {
    // Normalize text: collapse whitespace but preserve some structure
    const cleanText = text.replace(/\s+/g, ' ');

    // 1. Try to isolate the relevant section (Gesamtmix or Unternehmensmix)
    const { text: relevantText, mixType } = extractRelevantSection(cleanText);

    // 2. Find the Year (search in full text, year might be in the header)
    const yearMatch = cleanText.match(/(?:jahr|kennzeichnung|mix|lieferung|zeitraum|berichtsjahr)\s*(20\d{2})/i);
    const year = yearMatch?.[1] ? parseInt(yearMatch[1]) : new Date().getFullYear() - 1;

    // Track claimed text positions to prevent the same value being matched twice
    const claimedPositions = new Set<number>();

    // 3. Extract aggregate percentages from RELEVANT section only
    const renewable = extractValue(
        relevantText,
        [
            'erneuerbare energien',
            'erneuerbare energieträger',
            'regenerative energien',
            'regenerative energieträger',
            'ee-anteil',
            'ökostrom',
            'grüner strom',
            'mieterstrom (gefördert)',
        ],
        '%',
        claimedPositions
    );

    const nuclear = extractValue(
        relevantText,
        ['kernenergie', 'kernkraft', 'atomenergie', 'atomkraft', 'nuklear'],
        '%',
        claimedPositions
    );

    const fossil = extractValue(
        relevantText,
        ['fossile energieträger', 'fossile energien', 'sonstige fossile', 'konventionelle energien'],
        '%',
        claimedPositions
    );

    // 4. Extract subcategories
    const wind = extractValue(relevantText, ['windenergie', 'windkraft'], '%', claimedPositions);
    const solar = extractValue(relevantText, ['solarenergie', 'photovoltaik', 'sonnenenergie'], '%', claimedPositions);
    const biomass = extractValue(relevantText, ['biomasse', 'biogas', 'bioenergie'], '%', claimedPositions);
    const hydro = extractValue(relevantText, ['wasserkraft', 'lauf- und speicherwasser'], '%', claimedPositions);
    const coal = extractValue(relevantText, ['kohle', 'steinkohle', 'braunkohle'], '%', claimedPositions);
    const naturalGas = extractValue(relevantText, ['erdgas', 'gasförmige brennstoffe'], '%', claimedPositions);

    // 5. Extract environmental impact (separate claimed set)
    const co2Claims = new Set<number>();
    const co2 =
        extractValue(
            relevantText,
            ['co2-emissionen', 'co₂-emissionen', 'kohlendioxid', 'co2', 'co₂', 'treibhausgasemissionen'],
            'g/kwh',
            co2Claims
        ) || extractValue(relevantText, ['co2-emissionen', 'co₂-emissionen', 'kohlendioxid'], 'g / kwh', co2Claims);

    const wasteClaims = new Set<number>();
    const waste =
        extractValue(
            relevantText,
            ['radioaktiver abfall', 'radioaktive abfälle', 'atommüll', 'nuklearabfall'],
            'mg/kwh',
            wasteClaims
        ) || extractValue(relevantText, ['radioaktiver abfall', 'radioaktive abfälle'], 'mg / kwh', wasteClaims);

    // 6. EEG percentage
    const eeg = extractValue(
        relevantText,
        ['eeg-umlage', 'eeg-anteil', 'nach eeg gefördert', 'erneuerbare energien, gefördert'],
        '%',
        new Set<number>()
    );

    // Validate: at least one main category must be non-zero
    if ((renewable ?? 0) === 0 && (fossil ?? 0) === 0 && (nuclear ?? 0) === 0) {
        return null;
    }

    return {
        year,
        renewable: renewable ?? 0,
        fossil: fossil ?? 0,
        nuclear: nuclear ?? 0,
        wind: wind,
        solar: solar,
        biomass: biomass,
        hydro: hydro,
        other_renewable: null,
        eeg_funded: null,
        hkn: null,
        mieterstrom: null,
        coal: coal,
        natural_gas: naturalGas,
        other_fossil: null,
        co2: co2 ?? 0,
        waste: waste ?? 0,
        hkn_origins: null,
        eeg_percentage: eeg,
        tariff_name: null,
        confidence: estimateConfidence(renewable, fossil, nuclear, co2, waste),
        extraction_method: 'regex',
        mix_type: mixType,
    };
}

/**
 * Extract the relevant section from a Stromkennzeichnung page.
 *
 * Strategy:
 * 1. Find section boundaries by known headings
 * 2. Prefer "Gesamtenergieträgermix" section
 * 3. Fall back to "Unternehmensverkaufsmix" or "Unternehmensmix"
 * 4. EXCLUDE "Bundesmix Deutschland" (national average, not the company's data)
 * 5. If no sections found, return original text (backwards compatible)
 */
function extractRelevantSection(text: string): {
    text: string;
    mixType: 'gesamtmix' | 'unternehmensmix' | 'unbekannt';
} {
    const lower = text.toLowerCase();

    // Known section headings (in order of preference) with their mix_type
    const sectionMarkers: { keyword: string; type: 'gesamtmix' | 'unternehmensmix' }[] = [
        { keyword: 'gesamtenergieträgermix', type: 'gesamtmix' },
        { keyword: 'gesamtenergiemix', type: 'gesamtmix' },
        { keyword: 'gesamtstrommix', type: 'gesamtmix' },
        { keyword: 'unternehmensmix', type: 'unternehmensmix' },
        { keyword: 'unternehmensverkaufsmix', type: 'unternehmensmix' },
        { keyword: 'strommix des unternehmens', type: 'gesamtmix' },
        { keyword: 'energieträgermix des unternehmens', type: 'gesamtmix' },
        { keyword: 'stromkennzeichnung des unternehmens', type: 'gesamtmix' },
    ];

    // Headings that mark the END of the relevant section / START of Bundesmix
    const stopMarkers = [
        'bundesmix deutschland',
        'bundesmix',
        'strommix deutschland',
        'deutscher strommix',
        'nationaler strommix',
        'verbleibender energieträgermix',
    ];

    // Find the best start position
    let bestStart = -1;
    let detectedType: 'gesamtmix' | 'unternehmensmix' | 'unbekannt' = 'unbekannt';
    for (const marker of sectionMarkers) {
        const idx = lower.indexOf(marker.keyword);
        if (idx !== -1 && (bestStart === -1 || idx < bestStart)) {
            bestStart = idx;
            detectedType = marker.type;
            break; // Take the first match in priority order
        }
    }

    // Find the first stop position (Bundesmix heading)
    let stopPos = -1;
    for (const marker of stopMarkers) {
        const idx = lower.indexOf(marker);
        if (idx !== -1 && (stopPos === -1 || idx < stopPos)) {
            stopPos = idx;
        }
    }

    // Apply section boundaries
    if (bestStart !== -1 && stopPos !== -1 && stopPos > bestStart) {
        console.log(`  [REGEX] Sektion erkannt: Pos ${bestStart}-${stopPos} (von ${text.length} Zeichen)`);
        return { text: text.substring(bestStart, stopPos), mixType: detectedType };
    }

    if (bestStart !== -1) {
        const maxLen = Math.min(text.length, bestStart + 2000);
        console.log(`  [REGEX] Sektion erkannt ab Pos ${bestStart} (kein Bundesmix-Marker gefunden)`);
        return { text: text.substring(bestStart, maxLen), mixType: detectedType };
    }

    if (stopPos !== -1) {
        console.log(`  [REGEX] Bundesmix ab Pos ${stopPos} erkannt, verwende Text davor`);
        return { text: text.substring(0, stopPos), mixType: 'unbekannt' as const };
    }

    console.log(`  [REGEX] Keine Sektions-Marker gefunden, verwende Gesamttext`);
    return { text, mixType: 'unbekannt' as const };
}

/**
 * Estimate confidence based on how many fields were successfully extracted.
 */
function estimateConfidence(
    renewable: number | null,
    fossil: number | null,
    nuclear: number | null,
    co2: number | null,
    waste: number | null
): number {
    let score = 0;
    if (renewable !== null && renewable > 0) score += 25;
    if (fossil !== null && fossil >= 0) score += 20;
    if (nuclear !== null && nuclear >= 0) score += 15;
    if (co2 !== null && co2 > 0) score += 20;
    if (waste !== null && waste >= 0) score += 10;

    // Check if percentages roughly sum to 100
    const total = (renewable ?? 0) + (fossil ?? 0) + (nuclear ?? 0);
    if (total >= 95 && total <= 105) score += 10;

    return Math.min(100, score);
}

/**
 * Find a numeric value near a keyword in the text.
 *
 * Searches in two directions:
 *   1. BACKWARD (30 chars before keyword) — for "100 % Erneuerbare Energien" format
 *   2. FORWARD (100 chars after keyword) — for "Erneuerbare Energien: 100 %" format
 *
 * Backward matches are preferred (closer to typical German SKZ table format).
 * Position-claiming prevents the same value from being used by multiple categories.
 */
function extractValue(
    text: string,
    keywords: string[],
    unitSymbol: string,
    claimedPositions: Set<number>
): number | null {
    const lowerText = text.toLowerCase();
    const escapedUnit = escapeRegExp(unitSymbol);
    const regex = new RegExp(`(\\d+[.,]?\\d*)\\s*${escapedUnit}`, 'gi');

    for (const keyword of keywords) {
        const index = lowerText.indexOf(keyword);
        if (index === -1) continue;

        let match;

        // Collect candidates from both directions, pick the closest unclaimed one
        const candidates: { pos: number; value: number; distance: number }[] = [];

        // === FORWARD search (format: "Erneuerbare Energien: 100 %") ===
        const searchStart = index + keyword.length;
        const searchEnd = Math.min(lowerText.length, searchStart + 100);
        const snippet = lowerText.substring(searchStart, searchEnd);
        regex.lastIndex = 0;
        while ((match = regex.exec(snippet)) !== null) {
            const absolutePos = searchStart + match.index;
            if (claimedPositions.has(absolutePos)) continue;
            const numberStr = match[1]?.replace(',', '.') ?? '';
            const value = parseFloat(numberStr);
            if (unitSymbol === '%' && (value > 100 || value < 0)) continue;
            candidates.push({ pos: absolutePos, value, distance: match.index });
            break; // Only take the closest forward match
        }

        // === BACKWARD search (format: "100 % Erneuerbare Energien") ===
        const backStart = Math.max(0, index - 20);
        const backSnippet = lowerText.substring(backStart, index);
        regex.lastIndex = 0;
        let lastBackMatch: RegExpExecArray | null = null;
        while ((match = regex.exec(backSnippet)) !== null) {
            lastBackMatch = match;
        }
        if (lastBackMatch) {
            const absolutePos = backStart + lastBackMatch.index;
            if (!claimedPositions.has(absolutePos)) {
                const numberStr = lastBackMatch[1]?.replace(',', '.') ?? '';
                const value = parseFloat(numberStr);
                if (!(unitSymbol === '%' && (value > 100 || value < 0))) {
                    const distance = index - (absolutePos + lastBackMatch[0].length);
                    candidates.push({ pos: absolutePos, value, distance });
                }
            }
        }

        // Pick the closest candidate by distance
        if (candidates.length > 0) {
            candidates.sort((a, b) => a.distance - b.distance);
            const best = candidates[0];
            if (best) {
                claimedPositions.add(best.pos);
                return best.value;
            }
        }
    }
    return null;
}

function escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
