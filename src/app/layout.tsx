import type { Metadata } from 'next';
import { Public_Sans } from 'next/font/google';
import './globals.css';

const publicSans = Public_Sans({
    variable: '--font-public-sans',
    subsets: ['latin'],
    weight: ['300', '400', '500', '600', '700'],
});

export const metadata: Metadata = {
    title: 'SKZ-Cockpit — Stromkennzeichnungs-Datenbank',
    description: 'Überwachung und Analyse der Stromkennzeichnung deutscher Energieversorger nach § 42 EnWG',
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="de" suppressHydrationWarning>
            <head>
                <link
                    href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
                    rel="stylesheet"
                />
            </head>
            <body className={`${publicSans.variable} font-display bg-background-light text-slate-900`}>
                {children}
            </body>
        </html>
    );
}
