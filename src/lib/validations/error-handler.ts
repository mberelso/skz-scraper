import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';

/**
 * Centralized error handling for API routes
 */

export interface ApiError {
    error: string;
    details?: unknown;
    code?: string;
}

/**
 * Format Zod validation errors into user-friendly messages
 */
export function formatZodError(error: ZodError): ApiError {
    const firstError = error.issues[0];
    if (!firstError) {
        return {
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
        };
    }

    const field = firstError.path.join('.');
    const message = firstError.message;

    return {
        error: `Validation failed: ${field} - ${message}`,
        details: error.issues.map((err) => ({
            field: err.path.join('.'),
            message: err.message,
        })),
        code: 'VALIDATION_ERROR',
    };
}

/**
 * Standardized error response helper
 */
export function errorResponse(
    message: string,
    status: number = 400,
    details?: unknown,
    code?: string
): NextResponse<ApiError> {
    const response: ApiError = { error: message };
    if (details !== undefined) response.details = details;
    if (code !== undefined) response.code = code;

    return NextResponse.json(response, { status });
}

/**
 * Handle errors in API routes with consistent format
 */
export function handleApiError(error: unknown): NextResponse<ApiError> {
    // Zod validation error
    if (error instanceof ZodError) {
        return NextResponse.json(formatZodError(error), { status: 400 });
    }

    // Standard Error object
    if (error instanceof Error) {
        // Don't expose internal errors in production
        const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message;

        return errorResponse(message, 500, undefined, 'INTERNAL_ERROR');
    }

    // Unknown error
    return errorResponse('An unexpected error occurred', 500, undefined, 'UNKNOWN_ERROR');
}

/**
 * Validate request body with Zod schema
 * Returns parsed data or throws ZodError (caught by handleApiError)
 */
export async function validateRequest<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
    const body = await request.json();
    return schema.parse(body) as T; // Throws ZodError if invalid
}

/**
 * Validate path params with Zod schema
 */
export function validateParams<T>(params: unknown, schema: z.ZodType<T>): T {
    return schema.parse(params) as T; // Throws ZodError if invalid
}
