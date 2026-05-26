# Erweitertes Export-Center & Accessibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Export Center modal, PDF full report generation via Puppeteer, extended CSV exports, table checkboxes, and keyboard accessibility for all modals.

**Architecture:** We decouple database queries and formatters into a shared library `src/lib/export.ts` to allow easy testing. We add a `POST` handler to the CSV API and create a new `POST` API for PDF generation using Puppeteer. In the UI, we add multi-select checkboxes to the table, create an `ExportCenterModal.tsx`, and add global event listeners for keyboard traps (Esc, Tab) on all modals.

**Tech Stack:** Next.js (App Router), PostgreSQL (pg), Puppeteer (for PDF generation), React 19, Tailwind CSS.

---

### Task 1: Decoupled Export Helpers and Unittests

**Files:**
- Create: `src/lib/export.ts`
- Test: `src/lib/export.test.ts`

- [ ] **Step 1: Write the failing tests**
  Create `src/lib/export.test.ts` to test CSV formatting and PDF HTML generation.
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { generateCSV, generatePDFHtml } from './export';

  describe('Export Utils', () => {
      it('should format a list of providers to CSV correctly', () => {
          const mockProviders = [
              {
                  id: 1,
                  name: 'Test-Versorger',
                  city: 'Leipzig',
                  zip: '04109',
                  file_number: '123/456',
                  priority: 80,
                  active: true,
                  last_mix_year: 2024,
                  last_renewable_percentage: 60.5,
                  last_fossil_percentage: 39.5,
                  last_nuclear_percentage: 0,
                  co2_emission_g_kwh: 350,
                  last_confidence: 95,
                  last_extraction_method: 'gemini',
                  latest_job_status: 'success',
                  review_status: 'geprueft',
                  document_count: 2
              }
          ];

          const csv = generateCSV(mockProviders);
          expect(csv).toContain('Test-Versorger');
          expect(csv).toContain('Leipzig');
          expect(csv).toContain('60.5;');
      });

      it('should generate a valid PDF HTML template containing provider info', () => {
          const mockProviders = [
              {
                  id: 1,
                  name: 'Test-Versorger',
                  city: 'Leipzig',
                  zip: '04109',
                  last_mix_year: 2024,
                  last_renewable_percentage: 60.5,
                  last_fossil_percentage: 39.5,
                  last_nuclear_percentage: 0,
                  co2_emission_g_kwh: 350,
                  latest_job_status: 'success',
                  review_status: 'geprueft'
              }
          ];

          const html = generatePDFHtml(mockProviders, 2024);
          expect(html).toContain('Test-Versorger');
          expect(html).toContain('Stromkennzeichnungs-Bericht');
          expect(html).toContain('60.5%');
      });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run src/lib/export.test.ts`
  Expected: FAIL with missing import module.

- [ ] **Step 3: Write minimal implementation**
  Create `src/lib/export.ts` with CSV formatting, HTML generation, and the common SQL query structure.
  ```typescript
  import { query } from './db';

  export interface ExportParams {
      mode: 'filter' | 'manual';
      providerIds?: number[];
      filters?: {
          year?: number | string;
          reviewStatus?: string;
          city?: string;
      };
  }

  export async function queryExportData(params: ExportParams): Promise<any[]> {
      let sql = `
          SELECT DISTINCT
              p.id,
              p.name,
              p.city,
              p.zip,
              p.file_number,
              p.priority,
              p.review_status,
              p.active,
              (SELECT status FROM scrape_jobs WHERE provider_id = p.id ORDER BY id DESC LIMIT 1) as latest_job_status,
              (SELECT COUNT(*) FROM documents WHERE provider_id = p.id) as document_count,
              (SELECT year FROM energy_mix em WHERE em.provider_id = p.id ORDER BY em.id DESC LIMIT 1) as last_mix_year,
              (SELECT renewable_percentage FROM energy_mix em WHERE em.provider_id = p.id ORDER BY em.id DESC LIMIT 1) as last_renewable_percentage,
              (SELECT fossil_percentage FROM energy_mix em WHERE em.provider_id = p.id ORDER BY em.id DESC LIMIT 1) as last_fossil_percentage,
              (SELECT nuclear_percentage FROM energy_mix em WHERE em.provider_id = p.id ORDER BY em.id DESC LIMIT 1) as last_nuclear_percentage,
              (SELECT co2_emission_g_kwh FROM energy_mix em WHERE em.provider_id = p.id ORDER BY em.id DESC LIMIT 1) as co2_emission_g_kwh,
              (SELECT confidence FROM energy_mix em WHERE em.provider_id = p.id ORDER BY em.id DESC LIMIT 1) as last_confidence,
              (SELECT extraction_method FROM energy_mix em WHERE em.provider_id = p.id ORDER BY em.id DESC LIMIT 1) as last_extraction_method
          FROM providers p
      `;

      let queryParams: any[] = [];

      if (params.mode === 'manual' && params.providerIds && params.providerIds.length > 0) {
          const placeholders = params.providerIds.map(() => '?').join(',');
          sql += ` WHERE p.id IN (${placeholders})`;
          queryParams = [...params.providerIds];
      } else if (params.mode === 'filter' && params.filters) {
          const conditions: string[] = [];
          
          if (params.filters.reviewStatus && params.filters.reviewStatus !== 'all') {
              conditions.push(`COALESCE(p.review_status, 'offen') = ?`);
              queryParams.push(params.filters.reviewStatus);
          }
          if (params.filters.city && params.filters.city.trim()) {
              conditions.push(`LOWER(p.city) LIKE ?`);
              queryParams.push(`%${params.filters.city.trim().toLowerCase()}%`);
          }

          if (conditions.length > 0) {
              sql += ' WHERE ' + conditions.join(' AND ');
          }
      }

      sql += ' ORDER BY p.priority DESC, p.id ASC';

      let rows = await query(sql, queryParams);

      // Post-filtering for last_mix_year if year is specified (dynamic column)
      if (params.mode === 'filter' && params.filters?.year && params.filters.year !== 'all') {
          const targetYear = Number(params.filters.year);
          rows = rows.filter((r: any) => r.last_mix_year === targetYear);
      }

      return rows;
  }

  export function generateCSV(providers: any[]): string {
      const csvSafe = (val: string) => {
          const s = (val || '').replace(/"/g, '""');
          if (/^[=+\-@\t\r]/.test(s)) return `"'${s}"`;
          return `"${s}"`;
      };

      const csvHeader = [
          'Anbieter-ID',
          'Anbieter-Name',
          'Stadt',
          'PLZ',
          'Aktenzeichen',
          'Prioritaet',
          'Aktiv',
          'Jahr',
          'Erneuerbar %',
          'Fossil %',
          'Nuklear %',
          'CO2 (g/kWh)',
          'Konfidenz %',
          'Extraktionsmethode',
          'Letzter Job-Status',
          'Prüfstatus',
          'Dokumente',
      ].join(';');

      const statusLabels: Record<string, string> = {
          success: 'Erfolgreich',
          failed: 'Fehlgeschlagen',
          running: 'Laufend',
          partial: 'Teilweise',
          pending: 'Wartend',
      };

      const csvRows = providers.map((p: any) => {
          return [
              p.id,
              csvSafe(p.name),
              csvSafe(p.city),
              p.zip ?? '',
              p.file_number ?? '',
              p.priority ?? 50,
              p.active ? 'Ja' : 'Nein',
              p.last_mix_year ?? '',
              p.last_renewable_percentage ?? '',
              p.last_fossil_percentage ?? '',
              p.last_nuclear_percentage ?? '',
              p.co2_emission_g_kwh ?? '',
              p.last_confidence ?? '',
              p.last_extraction_method ?? '',
              statusLabels[p.latest_job_status] ?? 'Nie gescrapt',
              ({ offen: 'Offen', geprueft: 'Geprüft', beanstandet: 'Beanstandet' } as Record<string, string>)[
                  p.review_status
              ] || 'Offen',
              p.document_count ?? 0,
          ].join(';');
      });

      const BOM = '\uFEFF';
      return BOM + [csvHeader, ...csvRows].join('\n');
  }

  export function generatePDFHtml(providers: any[], year: number): string {
      const avgRenewable = providers.length > 0
          ? Math.round(providers.reduce((sum, p) => sum + (p.last_renewable_percentage ?? 0), 0) / providers.length)
          : 0;

      const rowsHtml = providers.map(p => `
          <tr>
              <td>${p.id}</td>
              <td style="font-weight: bold;">${p.name || '-'}</td>
              <td>${p.city || '-'}</td>
              <td>${p.last_mix_year || '-'}</td>
              <td style="color: #16a34a; font-weight: bold;">${p.last_renewable_percentage ?? 0}%</td>
              <td>${p.co2_emission_g_kwh ?? '-'} g/kWh</td>
              <td>${p.review_status === 'geprueft' ? 'Geprüft' : p.review_status === 'beanstandet' ? 'Beanstandet' : 'Offen'}</td>
          </tr>
      `).join('');

      return `
          <!DOCTYPE html>
          <html>
          <head>
              <meta charset="utf-8">
              <style>
                  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; margin: 2cm; line-height: 1.5; }
                  h1 { color: #4f46e5; font-size: 24px; margin-bottom: 0.5rem; }
                  h2 { color: #1e293b; font-size: 18px; margin-top: 1.5rem; margin-bottom: 0.5rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.25rem; }
                  .subtitle { color: #64748b; font-size: 14px; margin-bottom: 2rem; }
                  .kpi-container { display: flex; gap: 1rem; margin-bottom: 2rem; }
                  .kpi-card { flex: 1; padding: 1rem; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; text-align: center; }
                  .kpi-val { font-size: 24px; font-weight: bold; color: #4f46e5; }
                  .kpi-label { font-size: 11px; color: #64748b; text-transform: uppercase; margin-top: 0.25rem; }
                  table { width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: 12px; }
                  th, td { padding: 0.5rem; text-align: left; border-bottom: 1px solid #e2e8f0; }
                  th { background: #f1f5f9; color: #475569; font-weight: bold; }
              </style>
          </head>
          <body>
              <h1>Stromkennzeichnungs-Bericht</h1>
              <div class="subtitle">Generiert am ${new Date().toLocaleDateString('de-DE')} für das Berichtsjahr ${year}</div>
              
              <div class="kpi-container">
                  <div class="kpi-card">
                      <div class="kpi-val">${providers.length}</div>
                      <div class="kpi-label">Energieversorger</div>
                  </div>
                  <div class="kpi-card">
                      <div class="kpi-val">${avgRenewable}%</div>
                      <div class="kpi-label">Durchschnittl. EE-Anteil</div>
                  </div>
              </div>

              <h2>Übersicht der ausgewählten Anbieter</h2>
              <table>
                  <thead>
                      <tr>
                          <th>ID</th>
                          <th>Name</th>
                          <th>Stadt</th>
                          <th>Jahr</th>
                          <th>EE-Anteil</th>
                          <th>CO₂-Wert</th>
                          <th>Prüfstatus</th>
                      </tr>
                  </thead>
                  <tbody>
                      ${rowsHtml}
                  </tbody>
              </table>
          </body>
          </html>
      `;
  }
  ```

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx vitest run src/lib/export.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add src/lib/export.ts src/lib/export.test.ts
  git commit -m "feat: add decoupled export helper functions and unit tests"
  ```

---

### Task 2: CSV API Route Refactoring (POST Support)

**Files:**
- Modify: `src/app/api/export/csv/route.ts`

- [ ] **Step 1: Modify export CSV route to support POST**
  Rewrite `src/app/api/export/csv/route.ts` to retain GET behavior but also support POST.
  ```typescript
  import { NextRequest, NextResponse } from 'next/server';
  import { queryExportData, generateCSV, ExportParams } from '@/lib/export';

  export async function GET(req: NextRequest) {
      try {
          const { searchParams } = new URL(req.url);
          const search = searchParams.get('search')?.trim() || '';
          const status = searchParams.get('status') || 'all';
          const data = searchParams.get('data') || 'all';
          const review = searchParams.get('review') || 'all';

          // Call SQL builder with filter mode
          const providers = await queryExportData({
              mode: 'filter',
              filters: {
                  reviewStatus: review,
              }
          });

          // Handover search/status/data filtering (existing logic)
          let filtered = [...providers];
          if (search) {
              const q = search.toLowerCase();
              filtered = filtered.filter(
                  (p: any) =>
                      (p.name || '').toLowerCase().includes(q) ||
                      (p.city || '').toLowerCase().includes(q) ||
                      (p.zip || '').toString().includes(q) ||
                      (p.file_number || '').toLowerCase().includes(q)
              );
          }
          if (status !== 'all') {
              if (status === 'never') {
                  filtered = filtered.filter((p: any) => !p.latest_job_status);
              } else {
                  filtered = filtered.filter((p: any) => p.latest_job_status === status);
              }
          }
          if (data === 'with_data') {
              filtered = filtered.filter((p: any) => p.last_mix_year);
          } else if (data === 'no_data') {
              filtered = filtered.filter((p: any) => !p.last_mix_year);
          } else if (data === 'low_confidence') {
              filtered = filtered.filter((p: any) => p.last_confidence !== null && p.last_confidence < 40);
          }

          const csvContent = generateCSV(filtered);
          const today = new Date().toISOString().split('T')[0];
          const filterHint = search || status !== 'all' || data !== 'all' || review !== 'all' ? '-gefiltert' : '';
          const filename = `skz-export${filterHint}-${today}.csv`;

          return new NextResponse(csvContent, {
              status: 200,
              headers: {
                  'Content-Type': 'text/csv; charset=utf-8',
                  'Content-Disposition': `attachment; filename="${filename}"`,
              },
          });
      } catch (error: any) {
          console.error('[API] CSV GET Export error:', error);
          return NextResponse.json({ error: error.message }, { status: 500 });
      }
  }

  export async function POST(req: Request) {
      try {
          const body: ExportParams = await req.json();

          // Query data using decoupled helpers
          const providers = await queryExportData(body);
          const csvContent = generateCSV(providers);

          const today = new Date().toISOString().split('T')[0];
          const filename = `skz-export-custom-${today}.csv`;

          return new NextResponse(csvContent, {
              status: 200,
              headers: {
                  'Content-Type': 'text/csv; charset=utf-8',
                  'Content-Disposition': `attachment; filename="${filename}"`,
              },
          });
      } catch (error: any) {
          console.error('[API] CSV POST Export error:', error);
          return NextResponse.json({ error: error.message }, { status: 500 });
      }
  }
  ```

- [ ] **Step 2: Verify the endpoint compiles and runs**
  Run: `npm run build`
  Expected: Compiled successfully.

- [ ] **Step 3: Commit**
  ```bash
  git add src/app/api/export/csv/route.ts
  git commit -m "feat: add POST method support to export CSV API endpoint"
  ```

---

### Task 3: PDF Generation API Route

**Files:**
- Create: `src/app/api/export/pdf/route.ts`

- [ ] **Step 1: Implement PDF creation API route using Puppeteer**
  Create `src/app/api/export/pdf/route.ts` using Puppeteer.
  ```typescript
  import { NextResponse } from 'next/server';
  import puppeteer from 'puppeteer';
  import { queryExportData, generatePDFHtml, ExportParams } from '@/lib/export';

  export async function POST(req: Request) {
      let browser;
      try {
          const body: ExportParams = await req.json();

          // Query providers using common query runner
          const providers = await queryExportData(body);
          const year = body.filters?.year ? Number(body.filters.year) : new Date().getFullYear();

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

          return new NextResponse(pdfBuffer, {
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
  ```

- [ ] **Step 2: Verify compile and build**
  Run: `npm run build`
  Expected: Compiled successfully.

- [ ] **Step 3: Commit**
  ```bash
  git add src/app/api/export/pdf/route.ts
  git commit -m "feat: implement PDF export route utilizing Puppeteer HTML-to-PDF"
  ```

---

### Task 4: Add Checkboxes and Export Button to Dashboard

**Files:**
- Modify: `src/components/DashboardClient.tsx`
- Create: `src/components/ExportCenterModal.tsx`

- [ ] **Step 1: Create ExportCenterModal component**
  Create `src/components/ExportCenterModal.tsx` with filter and manual selection support.
  ```typescript
  'use client';

  import { useState, useEffect } from 'react';

  export default function ExportCenterModal({
      isOpen,
      onClose,
      initialSelectedIds,
      providers,
  }: {
      isOpen: boolean;
      onClose: () => void;
      initialSelectedIds: number[];
      providers: any[];
  }) {
      const [exportMode, setExportMode] = useState<'filter' | 'manual'>('filter');
      const [format, setFormat] = useState<'pdf' | 'csv'>('pdf');
      const [selectedIds, setSelectedIds] = useState<number[]>([]);
      const [searchQuery, setSearchQuery] = useState('');
      const [loading, setLoading] = useState(false);

      // Filters
      const [year, setYear] = useState('2024');
      const [status, setStatus] = useState('all');

      useEffect(() => {
          if (isOpen) {
              setSelectedIds(initialSelectedIds);
              setExportMode(initialSelectedIds.length > 0 ? 'manual' : 'filter');
          }
      }, [isOpen, initialSelectedIds]);

      if (!isOpen) return null;

      // Filter query suggestions
      const searchResults = searchQuery.trim()
          ? providers
                .filter(
                    (p) =>
                        p.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
                        !selectedIds.includes(p.id)
                )
                .slice(0, 5)
          : [];

      const addProvider = (id: number) => {
          setSelectedIds((prev) => [...prev, id]);
          setSearchQuery('');
      };

      const removeProvider = (id: number) => {
          setSelectedIds((prev) => prev.filter((item) => item !== id));
      };

      const handleExport = async () => {
          setLoading(true);
          try {
              const body: any = {
                  mode: exportMode,
              };

              if (exportMode === 'manual') {
                  body.providerIds = selectedIds;
              } else {
                  body.filters = {
                      year,
                      reviewStatus: status,
                  };
              }

              const endpoint = format === 'pdf' ? '/api/export/pdf' : '/api/export/csv';
              const res = await fetch(endpoint, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
              });

              if (!res.ok) throw new Error('Export fehlgeschlagen');

              const blob = await res.blob();
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = format === 'pdf' ? 'skz-bericht.pdf' : 'skz-export.csv';
              document.body.appendChild(a);
              a.click();
              a.remove();
          } catch (err: any) {
              alert(err.message);
          } finally {
              setLoading(false);
          }
      };

      // Count estimation
      const exportCount =
          exportMode === 'manual'
              ? selectedIds.length
              : providers.filter((p) => {
                    if (status !== 'all' && (p.review_status || 'offen') !== status) return false;
                    if (year !== 'all' && p.last_mix_year !== Number(year)) return false;
                    return true;
                }).length;

      return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col md:flex-row min-h-[400px]">
                  {/* Left Column: Filter Options */}
                  <div className="flex-1 p-6 border-r border-slate-100 flex flex-col gap-4">
                      <div className="flex justify-between items-center">
                          <h3 className="text-lg font-bold text-slate-800">1. Export-Modus</h3>
                          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
                      </div>

                      {/* Mode Toggles */}
                      <div className="flex gap-2 bg-slate-100 p-1 rounded-lg">
                          <button
                              onClick={() => setExportMode('filter')}
                              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${exportMode === 'filter' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                          >
                              Nach Filter
                          </button>
                          <button
                              onClick={() => setExportMode('manual')}
                              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${exportMode === 'manual' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                          >
                              Manuelle Auswahl
                          </button>
                      </div>

                      {exportMode === 'filter' ? (
                          <div className="space-y-3">
                              <div>
                                  <label className="text-xs font-bold text-slate-500 block mb-1">Berichtsjahr</label>
                                  <select value={year} onChange={(e) => setYear(e.target.value)} className="w-full border p-2 rounded text-sm bg-white">
                                      <option value="2024">2024</option>
                                      <option value="2023">2023</option>
                                      <option value="all">Alle Jahre</option>
                                  </select>
                              </div>
                              <div>
                                  <label className="text-xs font-bold text-slate-500 block mb-1">Prüfstatus</label>
                                  <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full border p-2 rounded text-sm bg-white">
                                      <option value="all">Alle Status</option>
                                      <option value="offen">Offen</option>
                                      <option value="geprueft">Geprüft</option>
                                      <option value="beanstandet">Beanstandet</option>
                                  </select>
                              </div>
                          </div>
                      ) : (
                          <div className="space-y-3 flex-1 flex flex-col min-h-0">
                              <div className="relative">
                                  <label className="text-xs font-bold text-slate-500 block mb-1">Provider suchen & hinzufügen</label>
                                  <input
                                      type="text"
                                      placeholder="Suchen..."
                                      value={searchQuery}
                                      onChange={(e) => setSearchQuery(e.target.value)}
                                      className="w-full border p-2 rounded text-sm"
                                  />
                                  {searchResults.length > 0 && (
                                      <div className="absolute left-0 right-0 top-full bg-white border shadow-lg rounded-md mt-1 z-10 max-h-40 overflow-y-auto">
                                          {searchResults.map((p) => (
                                              <button
                                                  key={p.id}
                                                  onClick={() => addProvider(p.id)}
                                                  className="w-full text-left p-2 hover:bg-slate-50 text-xs text-slate-700 block border-b last:border-0"
                                              >
                                                  {p.name} (${p.city || 'unbekannt'})
                                              </button>
                                          ))}
                                      </div>
                                  )}
                              </div>

                              <div className="flex-1 overflow-y-auto max-h-48 border rounded-lg p-2 space-y-1.5 bg-slate-50">
                                  {selectedIds.length === 0 ? (
                                      <span className="text-xs text-slate-400 block text-center py-6">Keine Provider ausgewählt</span>
                                  ) : (
                                      selectedIds.map((id) => {
                                          const p = providers.find((item) => item.id === id);
                                          return (
                                              <div key={id} className="flex justify-between items-center bg-white border px-2 py-1 rounded text-xs">
                                                  <span className="truncate flex-1 font-medium">{p?.name || `#${id}`}</span>
                                                  <button onClick={() => removeProvider(id)} className="text-red-500 font-bold hover:text-red-700 ml-2">✕</button>
                                              </div>
                                          );
                                      })
                                  )}
                              </div>
                          </div>
                      )}

                      <div className="flex gap-2 mt-auto">
                          <button onClick={onClose} className="flex-1 border p-2 rounded-lg text-sm text-slate-500 hover:bg-slate-50">Abbrechen</button>
                      </div>
                  </div>

                  {/* Right Column: Preview Pane */}
                  <div className="w-full md:w-56 bg-slate-50 p-6 flex flex-col gap-6 justify-center items-center">
                      <div className="text-center font-bold text-slate-600 text-sm">Zusammenfassung</div>
                      
                      <div className="w-16 h-20 bg-white border border-slate-200 rounded shadow-sm flex flex-col justify-between p-2">
                          <div className="h-1 bg-slate-100 rounded w-8"></div>
                          <div className="h-10 bg-indigo-50 flex items-center justify-center text-[10px] font-bold text-indigo-600 uppercase rounded">
                              {format}
                          </div>
                          <div className="h-1 bg-slate-100 rounded"></div>
                      </div>

                      <div className="text-center space-y-2">
                          <div className="text-xs font-bold text-indigo-600">{exportCount} Versorger</div>
                          
                          <div className="flex gap-1.5 justify-center">
                              <button
                                  onClick={() => setFormat('pdf')}
                                  className={`px-3 py-1 rounded text-xs font-bold ${format === 'pdf' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white border text-slate-500'}`}
                              >
                                  PDF
                              </button>
                              <button
                                  onClick={() => setFormat('csv')}
                                  className={`px-3 py-1 rounded text-xs font-bold ${format === 'csv' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white border text-slate-500'}`}
                              >
                                  CSV
                              </button>
                          </div>
                      </div>

                      <button
                          onClick={handleExport}
                          disabled={loading || exportCount === 0}
                          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg font-bold text-sm shadow-md transition disabled:opacity-50"
                      >
                          {loading ? 'Wird generiert...' : 'Export starten'}
                      </button>
                  </div>
              </div>
          </div>
      );
  }
  ```

- [ ] **Step 2: Add checkbox fields & modal connection in DashboardClient.tsx**
  Add state and handlers for checkboxes. Add the new button "Export-Center" beside the live update button.
  Render the table checkboxes.
  Let's read around line 30 to 45 and line 730 to 765 in `DashboardClient.tsx`.
  In `DashboardClient.tsx`:
  - Add state: `const [selectedProviderIds, setSelectedProviderIds] = useState<number[]>([]);`
  - Add state: `const [showExportModal, setShowExportModal] = useState(false);`
  - Add check handler:
    ```typescript
    const toggleSelectProvider = (id: number) => {
        setSelectedProviderIds((prev) =>
            prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
        );
    };
    const toggleSelectAll = () => {
        const pageIds = paginatedProviders.map((p: any) => p.id);
        const allSelected = pageIds.every((id) => selectedProviderIds.includes(id));
        if (allSelected) {
            setSelectedProviderIds((prev) => prev.filter((id) => !pageIds.includes(id)));
        } else {
            setSelectedProviderIds((prev) => Array.from(new Set([...prev, ...pageIds])));
        }
    };
    ```
  - In JSX table header:
    ```typescript
    <th className="px-6 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">
        <input
            type="checkbox"
            checked={paginatedProviders.length > 0 && paginatedProviders.map((p: any) => p.id).every((id) => selectedProviderIds.includes(id))}
            onChange={toggleSelectAll}
            className="rounded text-primary focus:ring-primary"
        />
    </th>
    ```
  - In JSX table body rows:
    ```typescript
    <td className="px-6 py-4 whitespace-nowrap">
        <input
            type="checkbox"
            checked={selectedProviderIds.includes(provider.id)}
            onChange={() => toggleSelectProvider(provider.id)}
            className="rounded text-primary focus:ring-primary"
        />
    </td>
    ```
  - Add the "Export-Center" button next to "Live-Update" toggle:
    ```typescript
    <button
        onClick={() => setShowExportModal(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-lg shadow-sm"
    >
        📥 Export-Center {selectedProviderIds.length > 0 && `(${selectedProviderIds.length})`}
    </button>
    ```
  - Render `<ExportCenterModal isOpen={showExportModal} onClose={() => setShowExportModal(false)} initialSelectedIds={selectedProviderIds} providers={providers} />` at the bottom of the JSX tree.

- [ ] **Step 3: Verify compile and build**
  Run: `npm run build`
  Expected: Compiled successfully.

- [ ] **Step 4: Commit**
  ```bash
  git add src/components/ExportCenterModal.tsx src/components/DashboardClient.tsx
  git commit -m "feat: add table checkboxes and ExportCenterModal frontend component"
  ```

---

### Task 5: Modal Accessibility Keyboard Traps

**Files:**
- Modify: `src/components/ProviderModal.tsx`
- Modify: `src/components/CreateProviderModal.tsx`
- Modify: `src/components/ExportCenterModal.tsx`

- [ ] **Step 1: Add keyboard handler hook to ProviderModal.tsx**
  Implement `keydown` handler to trap focus and close modal on Esc key.
  In `ProviderModal.tsx`:
  ```typescript
  // Near the top of the component
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      // Focus the modal initially for accessibility
      modalRef.current?.focus();

      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Escape') {
              onClose();
          }

          if (e.key === 'Tab' && modalRef.current) {
              const focusableElements = modalRef.current.querySelectorAll(
                  'button, [href], input, select, textarea, [tabindex="0"]'
              );
              const firstElement = focusableElements[0] as HTMLElement;
              const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

              if (e.shiftKey && document.activeElement === firstElement) {
                  lastElement.focus();
                  e.preventDefault();
              } else if (!e.shiftKey && document.activeElement === lastElement) {
                  firstElement.focus();
                  e.preventDefault();
              }
          }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => {
          window.removeEventListener('keydown', handleKeyDown);
      };
  }, [onClose]);
  ```
  Ensure the outer modal `div` has `ref={modalRef}` and `tabIndex={-1}`.

- [ ] **Step 2: Add keyboard handler hook to CreateProviderModal.tsx**
  Repeat the hook in `CreateProviderModal.tsx`.
  ```typescript
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      modalRef.current?.focus();

      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Escape') {
              onClose();
          }

          if (e.key === 'Tab' && modalRef.current) {
              const focusableElements = modalRef.current.querySelectorAll(
                  'button, [href], input, select, textarea, [tabindex="0"]'
              );
              const firstElement = focusableElements[0] as HTMLElement;
              const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

              if (e.shiftKey && document.activeElement === firstElement) {
                  lastElement.focus();
                  e.preventDefault();
              } else if (!e.shiftKey && document.activeElement === lastElement) {
                  firstElement.focus();
                  e.preventDefault();
              }
          }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
  ```
  Ensure outer `div` has `ref={modalRef}` and `tabIndex={-1}`.

- [ ] **Step 3: Add keyboard handler hook to ExportCenterModal.tsx**
  Repeat the hook in `ExportCenterModal.tsx`.
  ```typescript
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      if (isOpen) {
          modalRef.current?.focus();
      }

      const handleKeyDown = (e: KeyboardEvent) => {
          if (!isOpen) return;
          if (e.key === 'Escape') {
              onClose();
          }

          if (e.key === 'Tab' && modalRef.current) {
              const focusableElements = modalRef.current.querySelectorAll(
                  'button, [href], input, select, textarea, [tabindex="0"]'
              );
              const firstElement = focusableElements[0] as HTMLElement;
              const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

              if (e.shiftKey && document.activeElement === firstElement) {
                  lastElement.focus();
                  e.preventDefault();
              } else if (!e.shiftKey && document.activeElement === lastElement) {
                  firstElement.focus();
                  e.preventDefault();
              }
          }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);
  ```
  Ensure outer `div` has `ref={modalRef}` and `tabIndex={-1}`.

- [ ] **Step 4: Verify compile and format**
  Run: `npm run format && npm run build`
  Expected: Success without errors.

- [ ] **Step 5: Commit**
  ```bash
  git add src/components/ProviderModal.tsx src/components/CreateProviderModal.tsx src/components/ExportCenterModal.tsx
  git commit -m "accessibility: implement keyboard focus-trap and Esc closing on all modals"
  ```
