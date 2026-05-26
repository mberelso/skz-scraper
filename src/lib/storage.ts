import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';
const BUCKET_NAME = process.env.SUPABASE_BUCKET || 'skz-documents';

// Initialize Supabase client if credentials are provided
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

if (supabase) {
    console.log('[STORAGE] Supabase Storage client initialized.');
} else {
    console.log('[STORAGE] Supabase credentials missing. Falling back to local filesystem.');
}

/**
 * Erzeugt einen URL-sicheren Slug aus einem Provider-Namen.
 */
export function slugify(name: string): string {
    return name
        .toLowerCase()
        .replace(/[äÄ]/g, 'ae')
        .replace(/[öÖ]/g, 'oe')
        .replace(/[üÜ]/g, 'ue')
        .replace(/ß/g, 'ss')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * Helper to get MIME type from extension
 */
function getMimeType(ext: string): string {
    const MIME_TYPES: Record<string, string> = {
        pdf: 'application/pdf',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        html: 'text/html',
    };
    return MIME_TYPES[ext.toLowerCase()] || 'application/octet-stream';
}

/**
 * Speichert eine Datei (PDF, Screenshot, HTML) in Supabase Storage oder lokal.
 */
export async function saveFile(
    jobIdOrPrefix: number | string,
    fileType: 'pdf' | 'html' | 'image',
    buffer: Buffer,
    extension: string,
    providerSlug: string,
    reportingYear?: number
) {
    const year = reportingYear ? reportingYear.toString() : new Date().getFullYear().toString();
    const filename = `${jobIdOrPrefix}_${fileType}_${crypto.createHash('sha256').update(buffer).digest('hex').substring(0, 8)}.${extension}`;

    // Relative path used both as local path and Supabase object path
    const relativePath = `data/storage/${providerSlug}/${year}/${filename}`;

    if (supabase) {
        console.log(`[STORAGE] Uploading ${relativePath} to Supabase...`);
        const { error } = await supabase.storage.from(BUCKET_NAME).upload(relativePath, buffer, {
            contentType: getMimeType(extension),
            upsert: true,
        });

        if (error) {
            console.error('[STORAGE] Supabase upload failed:', error.message);
            throw error;
        }
    } else {
        // Fallback: Local filesystem
        const STORAGE_ROOT = path.join(process.cwd(), 'data', 'storage');
        const dirPath = path.join(STORAGE_ROOT, providerSlug, year);
        await fs.mkdir(dirPath, { recursive: true });
        const filePath = path.join(dirPath, filename);
        await fs.writeFile(filePath, buffer);
    }

    return {
        filePath: relativePath,
        fileHash: crypto.createHash('sha256').update(buffer).digest('hex'),
        originalFilename: filename,
    };
}

/**
 * Liest eine Datei aus Supabase Storage oder von der lokalen Festplatte.
 */
export async function readFile(filePath: string): Promise<Buffer> {
    if (supabase) {
        console.log(`[STORAGE] Downloading ${filePath} from Supabase...`);
        const { data, error } = await supabase.storage.from(BUCKET_NAME).download(filePath);

        if (error) {
            console.error('[STORAGE] Supabase download failed:', error.message);
            throw error;
        }

        const arrayBuffer = await data.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } else {
        // Fallback: Local filesystem
        const absolutePath = path.join(process.cwd(), filePath);
        return await fs.readFile(absolutePath);
    }
}

/**
 * Löscht eine Datei aus Supabase Storage oder von der lokalen Festplatte.
 */
export async function deleteFile(filePath: string): Promise<void> {
    if (supabase) {
        console.log(`[STORAGE] Deleting ${filePath} from Supabase...`);
        const { error } = await supabase.storage.from(BUCKET_NAME).remove([filePath]);

        if (error) {
            console.error('[STORAGE] Supabase deletion failed:', error.message);
            throw error;
        }
    } else {
        // Fallback: Local filesystem
        const absolutePath = path.join(process.cwd(), filePath);
        try {
            await fs.unlink(absolutePath);
        } catch (e: any) {
            console.warn(`[STORAGE] Local file delete failed (ignored): ${e.message}`);
        }
    }
}

/**
 * Prüft, ob eine Datei existiert.
 */
export async function fileExists(filePath: string): Promise<boolean> {
    if (supabase) {
        const dir = path.dirname(filePath);
        const base = path.basename(filePath);

        const { data, error } = await supabase.storage.from(BUCKET_NAME).list(dir, {
            search: base,
        });

        if (error || !data) return false;
        return data.some((item) => item.name === base);
    } else {
        // Fallback: Local filesystem
        const absolutePath = path.join(process.cwd(), filePath);
        try {
            await fs.access(absolutePath);
            return true;
        } catch {
            return false;
        }
    }
}
