/**
 * Fehler-Triage: Ordnet Job-Log-Meldungen fehlgeschlagener Scrapes einer
 * Kategorie zu, damit das Dashboard Fehlschläge gruppieren kann
 * (Retry-Kandidaten vs. Fälle für manuelle Nacharbeit).
 */
export type FailureCategory =
    | 'suchmaschine_blockiert'
    | 'kein_treffer'
    | 'timeout'
    | 'duplikat'
    | 'abgebrochen'
    | 'bereinigt'
    | 'sonstige';

export const FAILURE_CATEGORY_META: Record<FailureCategory, { label: string; hint: string }> = {
    suchmaschine_blockiert: {
        label: 'Suchmaschine blockiert',
        hint: 'Vorübergehend — später erneut scrapen',
    },
    kein_treffer: {
        label: 'Kein passender Treffer',
        hint: 'Meist manuelle URL-Pflege nötig (Details → URL eintragen)',
    },
    timeout: {
        label: 'Timeout',
        hint: 'Retry-Kandidat — Seite war zu langsam',
    },
    duplikat: {
        label: 'Duplikat-Konflikt',
        hint: 'Dokument existiert bereits — Archiv prüfen',
    },
    abgebrochen: {
        label: 'Abgebrochen',
        hint: 'Batch wurde gestoppt — einfach erneut scrapen',
    },
    bereinigt: {
        label: 'Bereinigt (Fremd-Dokument)',
        hint: 'Falsches Dokument wurde entfernt — erneut scrapen',
    },
    sonstige: {
        label: 'Sonstige Fehler',
        hint: 'Log-Meldung im Detail prüfen',
    },
};

export function categorizeFailure(logMessage: string | null | undefined): FailureCategory {
    const msg = (logMessage || '').toLowerCase();
    if (msg.includes('bereinigt')) return 'bereinigt';
    if (msg.includes('abgebrochen')) return 'abgebrochen';
    if (msg.includes('blockiert') || msg.includes('suchmaschinen nicht erreichbar')) return 'suchmaschine_blockiert';
    if (
        msg.includes('keine ergebnisse') ||
        msg.includes('keine zum anbieter passenden') ||
        msg.includes('passenden suchergebnisse')
    )
        return 'kein_treffer';
    if (msg.includes('timeout') || msg.includes('timed out')) return 'timeout';
    if (msg.includes('duplicate key') || msg.includes('unique constraint') || msg.includes('duplikat'))
        return 'duplikat';
    return 'sonstige';
}
