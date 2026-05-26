import { z } from 'zod';

/**
 * Common validation schemas used across the application
 */

// Positive integer (e.g., IDs)
export const positiveInt = z.number().int().positive();
export const positiveIntString = z.string().regex(/^\d+$/).transform(Number);

// Year validation (realistic range for energy data)
export const yearSchema = z.number().int().min(2000).max(2100);

// Percentage (0-100)
export const percentageSchema = z.number().min(0).max(100);
export const nullablePercentageSchema = percentageSchema.nullable();

// URL validation
export const urlSchema = z.string().url().max(1024);
export const nullableUrlSchema = urlSchema.nullable().optional();

// Confidence score (0-100)
export const confidenceSchema = z.number().int().min(0).max(100);

// Review status
export const reviewStatusSchema = z.enum(['offen', 'geprueft', 'beanstandet']);

// Extraction method
export const extractionMethodSchema = z.enum(['gemini_vision', 'gemini_text', 'regex', 'manual', 'ocr']);

// Mix type
export const mixTypeSchema = z.enum(['gesamtmix', 'unternehmensmix', 'tarifmix', 'unbekannt']);

// File type
export const fileTypeSchema = z.enum(['pdf', 'html', 'image']);

// HKN Origin
export const hknOriginSchema = z.object({
    country: z.string().min(1).max(100),
    percentage: percentageSchema,
});

export const hknOriginsArraySchema = z.array(hknOriginSchema).nullable().optional();
