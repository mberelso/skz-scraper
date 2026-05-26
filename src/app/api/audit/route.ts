import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * GET /api/audit?provider_id=123 — Get audit log entries for a provider
 */
export async function GET(req: NextRequest) {
    try {
        const providerId = req.nextUrl.searchParams.get('provider_id');

        if (!providerId) {
            return NextResponse.json({ error: 'provider_id required' }, { status: 400 });
        }

        const rows = await query(
            `SELECT id, action, entity_type, entity_id, description, created_at
             FROM audit_log
             WHERE provider_id = ?
             ORDER BY created_at DESC
             LIMIT 50`,
            [parseInt(providerId, 10)]
        );

        return NextResponse.json(rows);
    } catch (error: any) {
        console.error('[API] Audit log error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
