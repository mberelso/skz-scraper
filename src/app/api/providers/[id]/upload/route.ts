import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { slugify, saveFile } from '@/lib/storage';
import crypto from 'crypto';
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

const ALLOWED_TYPES: Record<string, { ext: string; fileType: 'pdf' | 'image' }> = {
    'application/pdf': { ext: 'pdf', fileType: 'pdf' },
    'image/png': { ext: 'png', fileType: 'image' },
    'image/jpeg': { ext: 'jpg', fileType: 'image' },
};

/**
 * POST /api/providers/:id/upload — Upload a PDF or image for a provider.
 * Accepts multipart/form-data with a "file" field.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const providerId = parseInt(id);
        if (isNaN(providerId)) {
            return NextResponse.json({ error: 'Ungültige Provider-ID' }, { status: 400 });
        }

        // Get provider name for slug
        const providerRows: any[] = await query('SELECT name FROM providers WHERE id = ?', [providerId]);
        if (providerRows.length === 0) {
            return NextResponse.json({ error: 'Provider nicht gefunden' }, { status: 404 });
        }
        const providerSlug = slugify(providerRows[0].name);

        // Parse multipart form data
        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'Keine Datei hochgeladen' }, { status: 400 });
        }

        // Validate file type
        const typeInfo = ALLOWED_TYPES[file.type];
        if (!typeInfo) {
            return NextResponse.json(
                {
                    error: `Dateityp "${file.type}" nicht erlaubt. Erlaubt: PDF, PNG, JPEG`,
                },
                { status: 400 }
            );
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                {
                    error: `Datei zu groß (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum: 20 MB`,
                },
                { status: 400 }
            );
        }

        // Read file buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Compute hash for dedup
        const hash = crypto.createHash('sha256').update(buffer).digest('hex');

        // Check for duplicate
        const existingRows: any[] = await query('SELECT id FROM documents WHERE file_hash = ?', [hash]);
        if (existingRows.length > 0) {
            return NextResponse.json(
                {
                    error: 'Dieses Dokument existiert bereits (identischer Inhalt)',
                    existingDocId: existingRows[0].id,
                },
                { status: 409 }
            );
        }

        // Save file to storage (cloud/local fallback)
        const savedFile = await saveFile('upload', typeInfo.fileType, buffer, typeInfo.ext, providerSlug);
        const relativePath = savedFile.filePath;

        // Insert document record
        const result: any = await query(
            `INSERT INTO documents (provider_id, file_type, file_path, file_hash, original_filename)
             VALUES (?, ?, ?, ?, ?)`,
            [providerId, typeInfo.fileType, relativePath, hash, file.name]
        );
        const documentId = Number(result.insertId);

        console.log(
            `[UPLOAD] Document ${documentId} saved for provider ${providerId}: ${file.name} (${typeInfo.fileType})`
        );

        await logAudit(
            'create',
            'document',
            documentId,
            providerId,
            `Manueller Upload: ${file.name} (${typeInfo.fileType}, ${(file.size / 1024).toFixed(0)} KB)`,
            null,
            { file_type: typeInfo.fileType, original_filename: file.name }
        );

        return NextResponse.json({
            success: true,
            message: `${file.name} hochgeladen`,
            documentId,
        });
    } catch (error: any) {
        console.error('[UPLOAD] Error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
