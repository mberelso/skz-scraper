import { query } from '@/lib/db';

type AuditAction = 'create' | 'update' | 'delete' | 'review_change' | 'scrape';

export async function logAudit(
    action: AuditAction,
    entityType: string,
    entityId: number | null,
    providerId: number | null,
    description: string,
    oldValue?: any,
    newValue?: any
) {
    try {
        await query(
            `INSERT INTO audit_log (action, entity_type, entity_id, provider_id, old_value, new_value, description)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                action,
                entityType,
                entityId,
                providerId,
                oldValue ? JSON.stringify(oldValue) : null,
                newValue ? JSON.stringify(newValue) : null,
                description,
            ]
        );
    } catch (e) {
        console.error('[AUDIT] Failed to write audit log:', e);
    }
}
