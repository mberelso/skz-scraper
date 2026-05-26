import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

// GET /api/providers/:id/notes — Liste aller Notizen
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const providerId = parseInt(id);
    if (isNaN(providerId)) return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 });

    const notes = await query(
        'SELECT id, text, created_at, updated_at FROM provider_notes WHERE provider_id = ? ORDER BY created_at DESC',
        [providerId]
    );

    return NextResponse.json(notes);
}

// POST /api/providers/:id/notes — Neue Notiz erstellen
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const providerId = parseInt(id);
    if (isNaN(providerId)) return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 });

    const body = await req.json();
    const text = (body.text || '').trim();

    if (!text) {
        return NextResponse.json({ error: 'Notiztext darf nicht leer sein' }, { status: 400 });
    }

    const result: any = await query('INSERT INTO provider_notes (provider_id, text) VALUES (?, ?)', [providerId, text]);

    return NextResponse.json({ id: Number(result.insertId), message: 'Notiz gespeichert' }, { status: 201 });
}
