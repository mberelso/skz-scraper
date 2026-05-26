/**
 * Simple in-memory rate limiter.
 * Tracks request counts per IP in a sliding window.
 */

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
setInterval(
    () => {
        const now = Date.now();
        for (const [key, entry] of store) {
            if (entry.resetAt < now) store.delete(key);
        }
    },
    5 * 60 * 1000
);

/**
 * Check rate limit for a given key (e.g. IP address).
 * Returns { success: true } if under limit, or { success: false, retryAfter } if exceeded.
 */
export function checkRateLimit(
    key: string,
    maxRequests: number = 60,
    windowMs: number = 60_000
): { success: boolean; remaining: number; retryAfter?: number } {
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || entry.resetAt < now) {
        store.set(key, { count: 1, resetAt: now + windowMs });
        return { success: true, remaining: maxRequests - 1 };
    }

    entry.count++;

    if (entry.count > maxRequests) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        return { success: false, remaining: 0, retryAfter };
    }

    return { success: true, remaining: maxRequests - entry.count };
}
