import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { createProviderSchema, CreateProviderInput } from '@/lib/validations/provider';
import { handleApiError, validateRequest } from '@/lib/validations/error-handler';

/**
 * POST /api/providers — Create new provider
 */
export async function POST(request: Request) {
    try {
        const data = await validateRequest<CreateProviderInput>(request, createProviderSchema);

        console.log('[API] Creating new provider:', data.name);

        // Check if provider with same name already exists
        const existing: any[] = await query('SELECT id FROM providers WHERE LOWER(name) = LOWER(?)', [data.name]);

        if (existing.length > 0) {
            return NextResponse.json(
                { error: `Provider "${data.name}" existiert bereits (ID: ${existing[0].id})` },
                { status: 400 }
            );
        }

        // Insert new provider
        const result: any = await query(
            `INSERT INTO providers (
                name, url, skz_url, address, zip, city,
                file_number, priority, review_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                data.name,
                data.url ?? null,
                data.skz_url ?? null,
                data.address ?? null,
                data.zip ?? null,
                data.city ?? null,
                data.file_number ?? null,
                data.priority ?? null,
                data.review_status ?? 'offen',
            ]
        );

        const newId = Number(result.insertId);

        await logAudit('create', 'provider', newId, newId, `Neuer Provider erstellt: ${data.name}`, null, {
            name: data.name,
            url: data.url,
        });

        return NextResponse.json({
            success: true,
            message: `Provider "${data.name}" erfolgreich erstellt`,
            id: newId,
        });
    } catch (error: unknown) {
        return handleApiError(error);
    }
}
