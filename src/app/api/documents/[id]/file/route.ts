import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { readFile, fileExists } from '@/lib/storage';
import path from 'path';

const MIME_TYPES: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    html: 'text/html',
};

/**
 * GET /api/documents/{id}/file — Streamt die gespeicherte Datei an den Browser.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const docId = Number(id);
        if (!docId || isNaN(docId)) {
            return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 });
        }

        const rows: any[] = await query('SELECT file_path, file_type, original_filename FROM documents WHERE id = ?', [
            docId,
        ]);

        if (rows.length === 0) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 });
        }

        const doc = rows[0];

        // Check if file exists in storage (cloud or local fallback)
        const exists = await fileExists(doc.file_path);
        if (!exists) {
            return NextResponse.json({ error: 'File not found in storage' }, { status: 404 });
        }

        const buffer = await readFile(doc.file_path);
        const ext = path.extname(doc.file_path).slice(1).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const filename = doc.original_filename || path.basename(doc.file_path);

        return new NextResponse(new Uint8Array(buffer), {
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': `inline; filename="${filename}"`,
                'Content-Length': buffer.length.toString(),
            },
        });
    } catch (error: any) {
        console.error('[API] Document file error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
