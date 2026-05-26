import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { updateProviderSchema, UpdateProviderInput, providerIdSchema } from '@/lib/validations/provider';
import { handleApiError, validateRequest, validateParams } from '@/lib/validations/error-handler';

/**
 * PATCH /api/providers/[id] — Update provider fields
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = validateParams(await params, providerIdSchema);
        const data = await validateRequest<UpdateProviderInput>(request, updateProviderSchema);

        // Check if provider exists
        const [existing]: any = await query('SELECT * FROM providers WHERE id = ?', [id]);
        if (!existing) {
            return NextResponse.json({ error: 'Provider nicht gefunden' }, { status: 404 });
        }

        // Build dynamic update query
        const updates: string[] = [];
        const values: any[] = [];
        const changes: Array<{ field: string; old: any; new: any }> = [];

        const fieldMap: Record<string, string> = {
            name: 'Name',
            url: 'URL',
            skz_url: 'SKZ-URL',
            address: 'Adresse',
            zip: 'PLZ',
            city: 'Stadt',
            file_number: 'Aktenzeichen',
            priority: 'Priorität',
            review_status: 'Prüfstatus',
        };

        for (const [key, label] of Object.entries(fieldMap)) {
            if (key in data) {
                const newValue = (data as any)[key] ?? null;
                const oldValue = existing[key] ?? null;

                if (newValue !== oldValue) {
                    updates.push(`${key} = ?`);
                    values.push(newValue);
                    changes.push({
                        field: label,
                        old: oldValue,
                        new: newValue,
                    });
                }
            }
        }

        if (updates.length === 0) {
            return NextResponse.json({ success: true, message: 'Keine Änderungen' });
        }

        // Execute update
        values.push(id);
        await query(`UPDATE providers SET ${updates.join(', ')} WHERE id = ?`, values);

        // Log audit entries
        for (const change of changes) {
            const action = change.field === 'Prüfstatus' ? 'review_change' : 'update';
            await logAudit(
                action,
                'provider',
                id,
                id,
                `${change.field} geändert: ${change.old || '-'} → ${change.new || '-'}`,
                { [change.field]: change.old },
                { [change.field]: change.new }
            );
        }

        return NextResponse.json({
            success: true,
            message: `Provider aktualisiert (${changes.length} Änderung${changes.length !== 1 ? 'en' : ''})`,
        });
    } catch (error: unknown) {
        return handleApiError(error);
    }
}

/**
 * DELETE /api/providers/[id] — Delete provider and all associated data
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = validateParams(await params, providerIdSchema);

        // Get provider info before deleting
        const [provider]: any = await query('SELECT name FROM providers WHERE id = ?', [id]);

        if (!provider) {
            return NextResponse.json({ error: 'Provider nicht gefunden' }, { status: 404 });
        }

        // Delete provider (CASCADE will delete related records)
        await query('DELETE FROM providers WHERE id = ?', [id]);

        await logAudit(
            'delete',
            'provider',
            id,
            id,
            `Provider gelöscht: ${provider.name}`,
            { name: provider.name },
            null
        );

        return NextResponse.json({
            success: true,
            message: `Provider "${provider.name}" und alle zugehörigen Daten gelöscht`,
        });
    } catch (error: unknown) {
        return handleApiError(error);
    }
}
