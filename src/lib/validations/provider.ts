import { z } from 'zod';
import { positiveIntString, reviewStatusSchema, nullableUrlSchema } from './common';

/**
 * Provider validation schemas
 */

// Path param validation
export const providerIdSchema = z.object({
    id: positiveIntString,
});

// POST /api/providers (create)
export const createProviderSchema = z.object({
    name: z.string().min(1).max(255),
    url: nullableUrlSchema,
    skz_url: nullableUrlSchema,
    address: z.string().max(255).nullable().optional(),
    zip: z.string().max(10).nullable().optional(),
    city: z.string().max(255).nullable().optional(),
    file_number: z.string().max(20).nullable().optional(),
    priority: z.number().int().min(1).max(100).nullable().optional(),
    review_status: reviewStatusSchema.nullable().optional(),
});

// PATCH /api/providers/[id] (update)
export const updateProviderSchema = createProviderSchema.partial();

// POST /api/providers/[id]/notes
export const createNoteSchema = z.object({
    text: z.string().min(1).max(5000),
});

// Path param for notes
export const noteIdSchema = z.object({
    id: positiveIntString,
    noteId: positiveIntString,
});

export type CreateProviderInput = z.infer<typeof createProviderSchema>;
export type UpdateProviderInput = z.infer<typeof updateProviderSchema>;
export type CreateNoteInput = z.infer<typeof createNoteSchema>;
