import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

// DELETE /api/providers/:id/notes/:noteId
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; noteId: string }> }) {
    const { id, noteId } = await params;
    const providerId = parseInt(id);
    const noteIdNum = parseInt(noteId);

    if (isNaN(providerId) || isNaN(noteIdNum)) {
        return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 });
    }

    await query('DELETE FROM provider_notes WHERE id = ? AND provider_id = ?', [noteIdNum, providerId]);

    return NextResponse.json({ message: 'Notiz gelöscht' });
}

// PATCH /api/providers/:id/notes/:noteId
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; noteId: string }> }) {
    const { id, noteId } = await params;
    const providerId = parseInt(id);
    const noteIdNum = parseInt(noteId);

    if (isNaN(providerId) || isNaN(noteIdNum)) {
        return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 });
    }

    const body = await req.json();
    const text = (body.text || '').trim();

    if (!text) {
        return NextResponse.json({ error: 'Notiztext darf nicht leer sein' }, { status: 400 });
    }

    await query('UPDATE provider_notes SET text = ? WHERE id = ? AND provider_id = ?', [text, noteIdNum, providerId]);

    return NextResponse.json({ message: 'Notiz aktualisiert' });
}
