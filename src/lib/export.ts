import { query } from './db';

export interface ExportParams {
    mode: 'filter' | 'manual';
    providerIds?: number[];
    filters?: {
        year?: number | string;
        reviewStatus?: string;
        city?: string;
    };
}

export async function queryExportData(params: ExportParams): Promise<any[]> {
    let sql = `
        SELECT DISTINCT
            p.id,
            p.name,
            p.city,
            p.zip,
            p.file_number,
            p.priority,
            p.review_status,
            p.active,
            (SELECT status FROM scrape_jobs WHERE provider_id = p.id ORDER BY id DESC LIMIT 1) as latest_job_status,
            (SELECT COUNT(*) FROM documents WHERE provider_id = p.id) as document_count,
            (SELECT year FROM energy_mix em WHERE em.provider_id = p.id ORDER BY em.id DESC LIMIT 1) as last_mix_year,
            (SELECT renewable_percentage FROM energy_mix em WHERE em.provider_id = p.id ORDER BY em.id DESC LIMIT 1) as last_renewable_percentage,
            (SELECT fossil_percentage FROM energy_mix em WHERE em.provider_id = p.id ORDER BY em.id DESC LIMIT 1) as last_fossil_percentage,
            (SELECT nuclear_percentage FROM energy_mix em WHERE em.provider_id = p.id ORDER BY em.id DESC LIMIT 1) as last_nuclear_percentage,
            (SELECT co2_emission_g_kwh FROM energy_mix em WHERE em.provider_id = p.id ORDER BY em.id DESC LIMIT 1) as co2_emission_g_kwh,
            (SELECT confidence FROM energy_mix em WHERE em.provider_id = p.id ORDER BY em.id DESC LIMIT 1) as last_confidence,
            (SELECT extraction_method FROM energy_mix em WHERE em.provider_id = p.id ORDER BY em.id DESC LIMIT 1) as last_extraction_method
        FROM providers p
    `;

    let queryParams: any[] = [];

    if (params.mode === 'manual' && params.providerIds && params.providerIds.length > 0) {
        const placeholders = params.providerIds.map(() => '?').join(',');
        sql += ` WHERE p.id IN (${placeholders})`;
        queryParams = [...params.providerIds];
    } else if (params.mode === 'filter' && params.filters) {
        const conditions: string[] = [];

        if (params.filters.reviewStatus && params.filters.reviewStatus !== 'all') {
            conditions.push(`COALESCE(p.review_status, 'offen') = ?`);
            queryParams.push(params.filters.reviewStatus);
        }
        if (params.filters.city && params.filters.city.trim()) {
            conditions.push(`LOWER(p.city) LIKE ?`);
            queryParams.push(`%${params.filters.city.trim().toLowerCase()}%`);
        }

        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }
    }

    sql += ' ORDER BY p.priority DESC, p.id ASC';

    let rows = await query(sql, queryParams);

    // Post-filtering for last_mix_year if year is specified (dynamic column)
    if (params.mode === 'filter' && params.filters?.year && params.filters.year !== 'all') {
        const targetYear = Number(params.filters.year);
        rows = rows.filter((r: any) => r.last_mix_year === targetYear);
    }

    return rows;
}

export function generateCSV(providers: any[]): string {
    const csvSafe = (val: string) => {
        const s = (val || '').replace(/"/g, '""');
        if (/^[=+\-@\t\r]/.test(s)) return `"'${s}"`;
        return `"${s}"`;
    };

    const csvHeader = [
        'Anbieter-ID',
        'Anbieter-Name',
        'Stadt',
        'PLZ',
        'Aktenzeichen',
        'Prioritaet',
        'Aktiv',
        'Jahr',
        'Erneuerbar %',
        'Fossil %',
        'Nuklear %',
        'CO2 (g/kWh)',
        'Konfidenz %',
        'Extraktionsmethode',
        'Letzter Job-Status',
        'Prüfstatus',
        'Dokumente',
    ].join(';');

    const statusLabels: Record<string, string> = {
        success: 'Erfolgreich',
        failed: 'Fehlgeschlagen',
        running: 'Laufend',
        partial: 'Teilweise',
        pending: 'Wartend',
    };

    const csvRows = providers.map((p: any) => {
        return [
            p.id,
            csvSafe(p.name),
            csvSafe(p.city),
            p.zip ?? '',
            p.file_number ?? '',
            p.priority ?? 50,
            p.active ? 'Ja' : 'Nein',
            p.last_mix_year ?? '',
            p.last_renewable_percentage ?? '',
            p.last_fossil_percentage ?? '',
            p.last_nuclear_percentage ?? '',
            p.co2_emission_g_kwh ?? '',
            p.last_confidence ?? '',
            p.last_extraction_method ?? '',
            statusLabels[p.latest_job_status] ?? 'Nie gescrapt',
            ({ offen: 'Offen', geprueft: 'Geprüft', beanstandet: 'Beanstandet' } as Record<string, string>)[
                p.review_status
            ] || 'Offen',
            p.document_count ?? 0,
        ].join(';');
    });

    const BOM = '\uFEFF';
    return BOM + [csvHeader, ...csvRows].join('\n');
}

export function generatePDFHtml(providers: any[], year: number): string {
    const avgRenewable =
        providers.length > 0
            ? Math.round(providers.reduce((sum, p) => sum + (p.last_renewable_percentage ?? 0), 0) / providers.length)
            : 0;

    const rowsHtml = providers
        .map(
            (p) => `
        <tr>
            <td>${p.id}</td>
            <td style="font-weight: bold;">${p.name || '-'}</td>
            <td>${p.city || '-'}</td>
            <td>${p.last_mix_year || '-'}</td>
            <td style="color: #16a34a; font-weight: bold;">${p.last_renewable_percentage ?? 0}%</td>
            <td>${p.co2_emission_g_kwh ?? '-'} g/kWh</td>
            <td>${p.review_status === 'geprueft' ? 'Geprüft' : p.review_status === 'beanstandet' ? 'Beanstandet' : 'Offen'}</td>
        </tr>
    `
        )
        .join('');

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; margin: 2cm; line-height: 1.5; }
                h1 { color: #4f46e5; font-size: 24px; margin-bottom: 0.5rem; }
                h2 { color: #1e293b; font-size: 18px; margin-top: 1.5rem; margin-bottom: 0.5rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.25rem; }
                .subtitle { color: #64748b; font-size: 14px; margin-bottom: 2rem; }
                .kpi-container { display: flex; gap: 1rem; margin-bottom: 2rem; }
                .kpi-card { flex: 1; padding: 1rem; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; text-align: center; }
                .kpi-val { font-size: 24px; font-weight: bold; color: #4f46e5; }
                .kpi-label { font-size: 11px; color: #64748b; text-transform: uppercase; margin-top: 0.25rem; }
                table { width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: 12px; }
                th, td { padding: 0.5rem; text-align: left; border-bottom: 1px solid #e2e8f0; }
                th { background: #f1f5f9; color: #475569; font-weight: bold; }
            </style>
        </head>
        <body>
            <h1>Stromkennzeichnungs-Bericht</h1>
            <div class="subtitle">Generiert am ${new Date().toLocaleDateString('de-DE')} für das Berichtsjahr ${year}</div>
            
            <div class="kpi-container">
                <div class="kpi-card">
                      <div class="kpi-val">${providers.length}</div>
                      <div class="kpi-label">Energieversorger</div>
                </div>
                <div class="kpi-card">
                      <div class="kpi-val">${avgRenewable}%</div>
                      <div class="kpi-label">Durchschnittl. EE-Anteil</div>
                </div>
            </div>

            <h2>Übersicht der ausgewählten Anbieter</h2>
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Name</th>
                        <th>Stadt</th>
                        <th>Jahr</th>
                        <th>EE-Anteil</th>
                        <th>CO₂-Wert</th>
                        <th>Prüfstatus</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        </body>
        </html>
    `;
}
