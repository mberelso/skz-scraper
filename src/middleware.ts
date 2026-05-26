import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    const authSecret = process.env.AUTH_SECRET;

    // If no AUTH_SECRET is configured, skip auth entirely
    if (!authSecret) {
        return NextResponse.next();
    }

    const { pathname } = request.nextUrl;

    // Allow login page and login API without auth
    if (pathname === '/login' || pathname === '/api/auth/login' || pathname === '/api/auth/logout') {
        return NextResponse.next();
    }

    // Allow static files
    if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
        return NextResponse.next();
    }

    // Check auth cookie
    const authCookie = request.cookies.get('skz-auth')?.value;
    if (authCookie === authSecret) {
        return NextResponse.next();
    }

    // Check API key header for programmatic access
    const apiKey = request.headers.get('x-api-key');
    if (apiKey === authSecret) {
        return NextResponse.next();
    }

    // Redirect to login page for UI requests
    if (!pathname.startsWith('/api/')) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // Return 401 for API requests
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
