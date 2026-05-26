import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const { password } = await request.json();
        const authSecret = process.env.AUTH_SECRET;

        if (!authSecret) {
            return NextResponse.json({ error: 'Auth nicht konfiguriert' }, { status: 500 });
        }

        if (password !== authSecret) {
            return NextResponse.json({ error: 'Falsches Passwort' }, { status: 401 });
        }

        const response = NextResponse.json({ success: true });
        response.cookies.set('skz-auth', authSecret, {
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24 * 7, // 7 days
        });

        return response;
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
