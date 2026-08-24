/**
 * Entfernt flüchtige Felder (wie Zeitstempel, Prompts, IDs) und rundet Floats für deterministischen Vergleich.
 */
const VOLATILE_KEYS = new Set([
    'raw_prompt',
    'raw_response',
    'model_name',
    'prompt_version',
    'validation_warnings',
    'extraction_method',
]);

export function normalize(value: unknown): unknown {
    if (typeof value === 'number') {
        return Number.isInteger(value) ? value : Math.round(value * 10000) / 10000;
    }
    if (Array.isArray(value)) {
        return value.map(normalize);
    }
    if (value !== null && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            if (VOLATILE_KEYS.has(k)) continue;
            out[k] = normalize(v);
        }
        return out;
    }
    return value;
}
