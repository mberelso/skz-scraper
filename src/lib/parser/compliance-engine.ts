export interface DeviationResult {
    deviationPercent: number;
    differenceMwh: number;
}

export function calculateDeviation(sollMwh: number, istMwh: number): DeviationResult {
    const differenceMwh = istMwh - sollMwh;
    if (sollMwh === 0) {
        return { deviationPercent: 0, differenceMwh };
    }
    const deviationPercent = parseFloat(((differenceMwh / sollMwh) * 100).toFixed(2));
    return { deviationPercent, differenceMwh };
}
