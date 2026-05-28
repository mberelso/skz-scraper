# Compliance & Audit Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aufbau eines behördlichen Prüfmoduls (Dashboard, Scraper, Datenmatching, Compliance) zur Überwachung der Stromkennzeichnungspflichten (§ 42 EnWG) und HKN-Entwertungen.

**Architecture:** Erweiterung der PostgreSQL-Datenbank um Compliance-Tabellen, Implementierung einer mathematischen Prüf-Engine im Backend und Integration einer 4-Säulen-Tabs-Oberfläche im React-Frontend.

**Tech Stack:** Next.js, React 19, Tailwind CSS, PostgreSQL (Neon.com)

---

### Task 1: Datenbank-Tabellen anlegen

**Files:**

- Create: `scripts/migrate-compliance.ts`
- Modify: `schema.sql`
- Test: `scripts/verify-compliance-tables.ts`

- [ ] **Step 1: SQL-Schema in schema.sql dokumentieren**

    Füge die DDL für `federal_constants`, `provider_yearly_stats`, `hkn_cancellations` und `compliance_audits` am Ende von `schema.sql` hinzu.

- [ ] **Step 2: Migrations-Skript erstellen**

    Erstelle `scripts/migrate-compliance.ts`, um die neuen Tabellen in der Live-PostgreSQL-Datenbank anzulegen:

    ```typescript
    import { query } from '../src/lib/db';

    async function migrate() {
        console.log('Running compliance migrations...');
        try {
            await query(`
                CREATE TABLE IF NOT EXISTS federal_constants (
                    year INT PRIMARY KEY,
                    eeg_percentage DECIMAL(5,2) NOT NULL,
                    renewable_percentage DECIMAL(5,2) NOT NULL,
                    fossil_percentage DECIMAL(5,2) NOT NULL,
                    nuclear_percentage DECIMAL(5,2) NOT NULL,
                    co2_emission_g_kwh DECIMAL(6,2) NOT NULL,
                    radioactive_waste_mg_kwh DECIMAL(10,4) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
            await query(`
                CREATE TABLE IF NOT EXISTS provider_yearly_stats (
                    id SERIAL PRIMARY KEY,
                    provider_id INT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
                    year INT NOT NULL,
                    delivered_volume_mwh DECIMAL(15,2) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT unique_provider_year UNIQUE (provider_id, year)
                );
            `);
            await query(`
                CREATE TABLE IF NOT EXISTS hkn_cancellations (
                    id SERIAL PRIMARY KEY,
                    provider_id INT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
                    year INT NOT NULL,
                    country VARCHAR(100) NOT NULL,
                    amount_mwh DECIMAL(15,2) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT unique_provider_year_country UNIQUE (provider_id, year, country)
                );
            `);
            await query(`
                CREATE TABLE IF NOT EXISTS compliance_audits (
                    id SERIAL PRIMARY KEY,
                    provider_id INT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
                    year INT NOT NULL,
                    status VARCHAR(50) DEFAULT 'offen' CHECK (status IN ('offen', 'plausibel', 'fehlerhaft_eeg', 'fehlerhaft_hkn', 'beanstandet')),
                    hkn_deviation_percent DECIMAL(8,2) DEFAULT NULL,
                    audit_note TEXT DEFAULT NULL,
                    audited_by VARCHAR(100) DEFAULT NULL,
                    audited_at TIMESTAMP DEFAULT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT unique_audit_provider_year UNIQUE (provider_id, year)
                );
            `);
            console.log('Migration completed successfully.');
        } catch (e: any) {
            console.error('Migration failed:', e.message);
            process.exit(1);
        } finally {
            process.exit(0);
        }
    }
    migrate();
    ```

- [ ] **Step 3: Migrations-Skript ausführen**

    Run: `npx tsx scripts/migrate-compliance.ts`
    Expected: "Migration completed successfully."

- [ ] **Step 4: Verifikations-Skript erstellen und ausführen**

    Erstelle `scripts/verify-compliance-tables.ts`:

    ```typescript
    import { query } from '../src/lib/db';
    async function test() {
        const tables = ['federal_constants', 'provider_yearly_stats', 'hkn_cancellations', 'compliance_audits'];
        for (const t of tables) {
            const res = await query(`SELECT COUNT(*) FROM ${t}`);
            console.log(`Table ${t} exists, rows:`, res);
        }
        process.exit(0);
    }
    test();
    ```

    Run: `npx tsx scripts/verify-compliance-tables.ts`
    Expected: Ausgabe zeigt 4 Tabellen mit Zeilenanzahl 0 an.

- [ ] **Step 5: Lösche Verifikations-Skript und Commit**

    Run: `rm scripts/verify-compliance-tables.ts`
    Commit: `git add schema.sql scripts/migrate-compliance.ts && git commit -m "migration: create compliance and audit database tables"`

---

### Task 2: CSV-Importeur & Matching-Logik (Backend)

**Files:**

- Create: `src/lib/scraper/matching-helper.ts`
- Create: `src/lib/scraper/matching-helper.test.ts`
- Create: `src/app/api/compliance/import/route.ts`

- [ ] **Step 1: Schreibe fehlschlagenden Unit-Test für Matching-Helfer**

    Erstelle `src/lib/scraper/matching-helper.test.ts` mit folgendem Inhalt:

    ```typescript
    import { describe, it, expect } from 'vitest';
    import { normalizeNameForMatching } from './matching-helper';

    describe('normalizeNameForMatching', () => {
        it('sollte GmbH, AG und Sonderzeichen entfernen', () => {
            expect(normalizeNameForMatching('AggerEnergie GmbH')).toBe('aggerenergie');
            expect(normalizeNameForMatching('Adolf Roth GmbH & Co. KG')).toBe('adolfroth');
            expect(normalizeNameForMatching('Stadtwerke Leipzig AG')).toBe('stadtwerkeleipzig');
        });
    });
    ```

    Run: `npx vitest run src/lib/scraper/matching-helper.test.ts`
    Expected: FAIL (Modul existiert nicht)

- [ ] **Step 2: Implementiere Matching-Helfer**

    Erstelle `src/lib/scraper/matching-helper.ts`:

    ```typescript
    export function normalizeNameForMatching(name: string): string {
        return name
            .toLowerCase()
            .replace(/\b(gmbh & co\.?\s*kg|gmbh & co\.?\s*ohg|gmbh|co\.?\s*kg|ag|eg|ug|se)\b/gi, '')
            .replace(/[^a-z0-9äöüß]/gi, '')
            .trim();
    }
    ```

- [ ] **Step 3: Führe Unit-Test aus**

    Run: `npx vitest run src/lib/scraper/matching-helper.test.ts`
    Expected: PASS

- [ ] **Step 4: Erstelle die API-Route für HKN-CSV-Import**

    Erstelle `src/app/api/compliance/import/route.ts`:

    ```typescript
    import { NextResponse } from 'next/server';
    import { query } from '@/lib/db';
    import { normalizeNameForMatching } from '@/lib/scraper/matching-helper';

    export async function POST(request: Request) {
        try {
            const { csvData } = await request.json();
            if (!csvData) {
                return NextResponse.json({ error: 'No CSV data provided' }, { status: 400 });
            }

            const lines = csvData
                .split('\n')
                .map((line: string) => line.trim())
                .filter(Boolean);
            // Skip header
            const dataLines = lines.slice(1);

            let importedCount = 0;
            let failedCount = 0;
            const log: string[] = [];

            // Load all providers for matching cache
            const providers: any[] = await query('SELECT id, name FROM providers');
            const normalizedProviders = providers.map((p) => ({
                id: p.id,
                name: p.name,
                norm: normalizeNameForMatching(p.name),
            }));

            for (const line of dataLines) {
                const [anbieter_name, berichtsjahr, strommenge_mwh, hkn_land, hkn_menge_mwh] = line.split(',');
                if (!anbieter_name || !berichtsjahr || !strommenge_mwh || !hkn_land || !hkn_menge_mwh) {
                    failedCount++;
                    continue;
                }

                const normName = normalizeNameForMatching(anbieter_name);
                const matched = normalizedProviders.find((p) => p.norm === normName);

                if (!matched) {
                    failedCount++;
                    log.push(`Anbieter nicht gefunden: "${anbieter_name}"`);
                    continue;
                }

                const year = parseInt(berichtsjahr);
                const volume = parseFloat(strommenge_mwh);
                const amount = parseFloat(hkn_menge_mwh);

                // 1. Save volume stats
                await query(
                    `INSERT INTO provider_yearly_stats (provider_id, year, delivered_volume_mwh)
                     VALUES (?, ?, ?) ON CONFLICT (provider_id, year) DO UPDATE SET delivered_volume_mwh = EXCLUDED.delivered_volume_mwh`,
                    [matched.id, year, volume]
                );

                // 2. Save HKN Cancellation
                await query(
                    `INSERT INTO hkn_cancellations (provider_id, year, country, amount_mwh)
                     VALUES (?, ?, ?, ?) ON CONFLICT (provider_id, year, country) DO UPDATE SET amount_mwh = EXCLUDED.amount_mwh`,
                    [matched.id, year, hkn_land.trim(), amount]
                );

                importedCount++;
            }

            return NextResponse.json({ success: true, importedCount, failedCount, log });
        } catch (e: any) {
            return NextResponse.json({ error: e.message }, { status: 500 });
        }
    }
    ```

- [ ] **Step 5: Commit**

    Commit: `git add src/lib/scraper/matching-helper.ts src/lib/scraper/matching-helper.test.ts src/app/api/compliance/import/route.ts && git commit -m "feat: add CSV import api endpoint and matching helper"`

---

### Task 3: Compliance-Berechnungs-Engine (Backend)

**Files:**

- Create: `src/lib/parser/compliance-engine.ts`
- Create: `src/lib/parser/compliance-engine.test.ts`
- Create: `src/app/api/compliance/status/route.ts`

- [ ] **Step 1: Schreibe Unit-Tests für Abweichungsberechnung**

    Erstelle `src/lib/parser/compliance-engine.test.ts`:

    ```typescript
    import { describe, it, expect } from 'vitest';
    import { calculateDeviation } from './compliance-engine';

    describe('calculateDeviation', () => {
        it('sollte HKN Mengenabweichung in Prozent korrekt berechnen', () => {
            // Soll: 4000 MWh, Ist: 3600 MWh
            const res = calculateDeviation(4000, 3600);
            expect(res.deviationPercent).toBe(-10.0);
            expect(res.differenceMwh).toBe(-400.0);
        });

        it('sollte HKN Mengenabweichung bei 0 Soll-Menge handhaben', () => {
            const res = calculateDeviation(0, 50);
            expect(res.deviationPercent).toBe(0);
            expect(res.differenceMwh).toBe(50);
        });
    });
    ```

    Run: `npx vitest run src/lib/parser/compliance-engine.test.ts`
    Expected: FAIL (Engine existiert nicht)

- [ ] **Step 2: Implementiere Compliance-Engine**

    Erstelle `src/lib/parser/compliance-engine.ts`:

    ```typescript
    export interface DeviationResult {
        deviationPercent: number;
        differenceMwh: number;
    }

    export function calculateDeviation(sollMwh: number, istMwh: number): DeviationResult {
        const differenceMwh = istMwh - sollMwh;
        if (sollMwh === 0) {
            return { deviationPercent: 0, differenceMwh };
        }
        const deviationPercent = parseFloat(((differenceMwh / sollMwh) * 100).toFixed(2));
        return { deviationPercent, differenceMwh };
    }
    ```

- [ ] **Step 3: Führe Unit-Test aus**

    Run: `npx vitest run src/lib/parser/compliance-engine.test.ts`
    Expected: PASS

- [ ] **Step 4: Erstelle die API-Route für Compliance-Audits**

    Erstelle `src/app/api/compliance/status/route.ts`:

    ```typescript
    import { NextResponse } from 'next/server';
    import { query } from '@/lib/db';
    import { calculateDeviation } from '@/lib/parser/compliance-engine';

    export async function GET(request: Request) {
        try {
            const { searchParams } = new URL(request.url);
            const yearStr = searchParams.get('year') || new Date().getFullYear().toString();
            const year = parseInt(yearStr);

            // Get constants
            const constantsRows: any[] = await query('SELECT * FROM federal_constants WHERE year = ?', [year]);
            const constants = constantsRows[0] || null;

            // Query providers with merged SKZ and Cancellation stats
            const auditRows: any[] = await query(
                `
                SELECT 
                    p.id as provider_id,
                    p.name as provider_name,
                    p.file_number,
                    em.hkn_percentage,
                    em.eeg_percentage,
                    em.renewable_percentage,
                    pys.delivered_volume_mwh,
                    COALESCE(ca.status, 'offen') as audit_status,
                    ca.audit_note,
                    ca.audited_by,
                    ca.audited_at
                FROM providers p
                LEFT JOIN provider_yearly_stats pys ON p.id = pys.provider_id AND pys.year = ?
                LEFT JOIN documents d ON p.id = d.provider_id AND d.reporting_year = ? AND d.file_type = 'pdf'
                LEFT JOIN energy_mix em ON d.id = em.document_id
                LEFT JOIN compliance_audits ca ON p.id = ca.provider_id AND ca.year = ?
                WHERE p.active = true
            `,
                [year, year, year]
            );

            const results = [];

            for (const row of auditRows) {
                const hknPercent = parseFloat(row.hkn_percentage || '0');
                const volume = parseFloat(row.delivered_volume_mwh || '0');
                const sollMwh = (hknPercent / 100) * volume;

                // Sum cancellations
                const cancelRows: any[] = await query(
                    'SELECT SUM(amount_mwh) as total FROM hkn_cancellations WHERE provider_id = ? AND year = ?',
                    [row.provider_id, year]
                );
                const istMwh = parseFloat(cancelRows[0]?.total || '0');

                const dev = calculateDeviation(sollMwh, istMwh);

                // Percentage point diff in mix
                const calculatedMixHkn = volume > 0 ? (istMwh / volume) * 100 : 0;
                const mixPointDiff = parseFloat((calculatedMixHkn - hknPercent).toFixed(2));

                results.push({
                    provider_id: row.provider_id,
                    provider_name: row.provider_name,
                    file_number: row.file_number,
                    delivered_volume_mwh: volume,
                    hkn_percentage: hknPercent,
                    eeg_percentage: parseFloat(row.eeg_percentage || '0'),
                    renewable_percentage: parseFloat(row.renewable_percentage || '0'),
                    soll_mwh: sollMwh,
                    ist_mwh: istMwh,
                    deviation_percent: dev.deviationPercent,
                    difference_mwh: dev.differenceMwh,
                    mix_point_diff: mixPointDiff,
                    audit_status: row.audit_status,
                    audit_note: row.audit_note,
                    audited_by: row.audited_by,
                    audited_at: row.audited_at,
                });
            }

            return NextResponse.json({ success: true, year, constants, audits: results });
        } catch (e: any) {
            return NextResponse.json({ error: e.message }, { status: 500 });
        }
    }

    export async function POST(request: Request) {
        try {
            const { provider_id, year, status, audit_note, audited_by } = await request.json();
            if (!provider_id || !year || !status) {
                return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
            }

            // Calculate current deviation for storing
            // (Can fetch from DB or recalculate)
            await query(
                `
                INSERT INTO compliance_audits (provider_id, year, status, audit_note, audited_by, audited_at)
                VALUES (?, ?, ?, ?, ?, NOW())
                ON CONFLICT (provider_id, year) 
                DO UPDATE SET status = EXCLUDED.status, audit_note = EXCLUDED.audit_note, audited_by = EXCLUDED.audited_by, audited_at = NOW()
            `,
                [provider_id, year, status, audit_note, audited_by]
            );

            return NextResponse.json({ success: true });
        } catch (e: any) {
            return NextResponse.json({ error: e.message }, { status: 500 });
        }
    }
    ```

- [ ] **Step 5: Commit**

    Commit: `git add src/lib/parser/compliance-engine.ts src/lib/parser/compliance-engine.test.ts src/app/api/compliance/status/route.ts && git commit -m "feat: add compliance engine and api endpoints"`

---

### Task 4: Frontend UI (Cockpit, Matching & Compliance-Tabs)

**Files:**

- Modify: `src/components/DashboardClient.tsx`
- Create: `src/components/ComplianceTab.tsx`
- Create: `src/components/MatchingTab.tsx`

- [ ] **Step 1: Integration der 4 Tabs im DashboardClient**

    Passe `src/components/DashboardClient.tsx` an, um eine Tab-Auswahl zu rendern (Dashboard | Scraper | Datenmatching | Compliance).
    (Der Scraper-Reiter zeigt die bisherige Standard-Tabelle an).

- [ ] **Step 2: Erstellung der Datenmatching-UI**

    Erstelle `src/components/MatchingTab.tsx`. Diese Ansicht ermöglicht das Hochladen der HKN-CSV-Datei per File-Select und rendert eine Tabelle der Liefervolumen.
    - **Elemente:**
        - File-Upload-Drag-and-Drop Bereich.
        - Tabelle aller Liefermengen pro Provider für das aktuelle Jahr mit direkter manueller inline-Editierbarkeit der Werte.

- [ ] **Step 3: Erstellung des Compliance-Reiters (inklusive Filter)**

    Erstelle `src/components/ComplianceTab.tsx` mit:
    - Filterleiste: Filtern nach Status (`plausibel`, `beanstandet`, etc.) und Filtern nach Mengen-Abweichung (Unterdeckung / Überdeckung sowie Schieberegler/Eingabefeld für den Abweichungsgrad in %).
    - Farbkodierter Soll/Ist-Tabelle für den BDEW-Leitfaden-Check.
    - Audit-Modal: Sachbearbeiter können per Klick ein Modal öffnen, um Notizen/Prüfvermerke einzutragen und den Compliance-Status auf "Plausibel" oder "Beanstandet" zu setzen (was per API-POST in `compliance_audits` gespeichert wird).

- [ ] **Step 4: Formatierung & Typprüfung verifizieren**

    Run: `npx prettier --write .`
    Run: `npx tsc --noEmit`
    Run: `npx vitest run`
    Expected: Alles fehlerfrei und grün!

- [ ] **Step 5: Commit**

    Commit: `git add . && git commit -m "feat: add dashboard tabs, matching tab and compliance audit view UI"`
