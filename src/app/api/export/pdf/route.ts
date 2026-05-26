import { NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import { queryExportData, generatePDFHtml, ExportParams } from '@/lib/export';

export async function POST(req: Request) {
    let browser;
    try {
        const body: ExportParams = await req.json();

        // Query providers using common query runner
        const providers = await queryExportData(body);
        const year =
            body.filters?.year && body.filters.year !== 'all' ? Number(body.filters.year) : new Date().getFullYear();

        // Generate HTML template
        const html = generatePDFHtml(providers, year);

        // Render HTML using Puppeteer
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'domcontentloaded' });
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '1cm', bottom: '1cm', left: '1cm', right: '1cm' },
        });

        await browser.close();
        browser = null;

        const today = new Date().toISOString().split('T')[0];
        const filename = `skz-report-${today}.pdf`;

        return new NextResponse(Buffer.from(pdfBuffer), {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    } catch (error: any) {
        console.error('[API] PDF Export error:', error);
        if (browser) await browser.close();
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
