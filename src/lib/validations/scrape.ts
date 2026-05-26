import { z } from 'zod';
import { positiveInt, urlSchema } from './common';

/**
 * Scrape API validation schemas
 */

// POST /api/scrape
export const scrapeRequestSchema = z.object({
    providerId: positiveInt,
    providerName: z.string().min(1).max(255),
    url: urlSchema.optional(),
});

// POST /api/scrape-batch
export const scrapeBatchRequestSchema = z.object({
    providerIds: z.array(positiveInt).min(1).max(100),
});

// POST /api/documents/[id]/analyze
export const analyzeDocumentSchema = z.object({
    method: z.enum(['gemini_vision', 'tesseract_ocr']),
});

export type ScrapeRequestInput = z.infer<typeof scrapeRequestSchema>;
export type ScrapeBatchRequestInput = z.infer<typeof scrapeBatchRequestSchema>;
export type AnalyzeDocumentInput = z.infer<typeof analyzeDocumentSchema>;
