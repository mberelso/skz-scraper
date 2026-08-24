import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { logAudit } from '@/lib/audit';

/**
 * POST /api/energy-mix/:id/source — Unbestätigte Quelle eines Mix-Eintrags bestätigen.
 * Setzt source_status='bestaetigt' und nimmt die Domain in die trusted_sources-Whitelist
 * des Providers auf, damit künftige Scrapes derselben Domain nicht erneut markiert werden.
 * (Verwerfen läuft über DELETE /api/documents/:id.)
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const mixId = parseInt(id);
        if (isNaN(mixId)) {
            return NextResponse.json({ error: 'Ungültige Mix-ID' }, { status: 400 });
        }

        const rows: any[] = await query(
            `SELECT em.id, em.provider_id, em.source_status, d.source_url
             FROM energy_mix em
             LEFT JOIN documents d ON d.id = em.document_id
             WHERE em.id = ?`,
            [mixId]
        );
        if (rows.length === 0) {
            return NextResponse.json({ error: 'Mix-Eintrag nicht gefunden' }, { status: 404 });
        }
        const mix = rows[0];

        await query("UPDATE energy_mix SET source_status = 'bestaetigt' WHERE id = ?", [mixId]);

        // Domain in Whitelist aufnehmen
        let domain: string | null = null;
        if (mix.source_url) {
            try {
                domain = new URL(mix.source_url).hostname.toLowerCase().replace(/^www\./, '');
                await query(
                    'INSERT INTO trusted_sources (provider_id, domain) VALUES (?, ?) ON CONFLICT (provider_id, domain) DO NOTHING',
                    [mix.provider_id, domain]
                );
            } catch {
                // Ungültige URL — nur den Mix bestätigen
            }
        }

        await logAudit(
            'update',
            'energy_mix',
            mixId,
            mix.provider_id,
            `Quelle bestätigt${domain ? ` (Domain ${domain} in Whitelist aufgenommen)` : ''}`,
            { source_status: mix.source_status },
            { source_status: 'bestaetigt' }
        );

        return NextResponse.json({
            success: true,
            message: domain
                ? `Quelle bestätigt — ${domain} ist jetzt für diesen Anbieter vertrauenswürdig`
                : 'Quelle bestätigt',
        });
    } catch (error: any) {
        console.error('[API] Source confirm error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
