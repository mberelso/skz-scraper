import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { deleteFile } from '@/lib/storage';

/**
 * DELETE /api/documents/:id — Delete a document, its energy_mix entries, and physical file.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const docId = parseInt(id);
        if (isNaN(docId)) {
            return NextResponse.json({ error: 'Ungültige Dokument-ID' }, { status: 400 });
        }

        // Get document info before deletion
        const rows: any[] = await query(
            'SELECT id, file_path, provider_id, file_type, original_filename FROM documents WHERE id = ?',
            [docId]
        );
        if (rows.length === 0) {
            return NextResponse.json({ error: 'Dokument nicht gefunden' }, { status: 404 });
        }

        const doc = rows[0];

        // Delete energy_mix entries linked to this document
        const mixRows: any[] = await query('SELECT id FROM energy_mix WHERE document_id = ?', [docId]);
        if (mixRows.length > 0) {
            await query('DELETE FROM energy_mix WHERE document_id = ?', [docId]);
            console.log(`[DELETE DOC] Deleted ${mixRows.length} energy_mix entries for document ${docId}`);
        }

        // Also delete energy_mix entries that were linked by provider_id
        // and were created around the same time as this document (within 1 minute)
        // This catches entries where document_id wasn't properly set
        void (await query(
            `
            DELETE FROM energy_mix
            WHERE provider_id = ?
              AND document_id IS NULL
              AND ABS(TIMESTAMPDIFF(SECOND, created_at, (SELECT created_at FROM documents WHERE id = ?))) < 60
        `,
            [doc.provider_id, docId]
        ));

        // Delete the document record (CASCADE will also clean up any remaining energy_mix)
        await query('DELETE FROM documents WHERE id = ?', [docId]);

        // Delete the file from storage
        if (doc.file_path) {
            try {
                await deleteFile(doc.file_path);
                console.log(`[DELETE DOC] Storage file deleted: ${doc.file_path}`);
            } catch (err: any) {
                console.warn(`[DELETE DOC] Storage file delete failed: ${err.message}`);
            }
        }

        // Audit log
        await logAudit(
            'delete',
            'document',
            docId,
            doc.provider_id,
            `Dokument gelöscht: ${doc.original_filename || doc.file_type} (+ ${mixRows.length} Strommix-Einträge)`,
            { file_type: doc.file_type, original_filename: doc.original_filename },
            null
        );

        return NextResponse.json({
            success: true,
            message: `Dokument und ${mixRows.length} Strommix-Eintrag(e) gelöscht`,
        });
    } catch (error: any) {
        console.error('[DELETE DOC] Error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
