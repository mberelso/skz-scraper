# Codebase Refactoring & AI Guidelines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up the monolithic scraper logic by extracting DuckDuckGo search/ranking and validation/saving logic into helper files, and create a permanent AGENTS.md rulebook.

**Architecture:** Extraction of utility functions to stateless helper files (`search-helper.ts`, `save-helper.ts`) to make `engine.ts` and `runner.ts` smaller, importing them back, and updating unit tests.

**Tech Stack:** TypeScript, Next.js, Puppeteer, Vitest, PostgreSQL.

---

### Task 1: AI Guidelines erstellen

**Files:**
- Create: `AGENTS.md`

- [ ] **Step 1: Erstelle die AGENTS.md-Datei im Root-Verzeichnis**

```markdown
# SKZ-Scraper Project Guidelines

Diese Richtlinien müssen von allen KI-Assistenten bei der Arbeit an diesem Projekt zwingend befolgt werden.

## 1. Arbeitsweise & Benutzerpräferenzen
- **Sprache:** Kommuniziere immer auf Deutsch mit dem Benutzer (Martin).
- **Betriebssystem:** Der Benutzer arbeitet auf Windows. Verwende Windows-kompatible Pfade und Befehle.
- **Wichtigste Verhaltensregeln:**
  1. Sobald der Benutzer bestätigt hat, dass ein Feature funktioniert, aktualisiere automatisch die `README.md` mit den neuen Status- und Architekturdetails.
  2. Wenn Aufgaben in `task.md` abgeschlossen sind, aktualisiere die Datei sofort, um den Fortschritt widerzuspiegeln.
  3. Verwende niemals Platzhalter-Code. Code muss immer vollständig implementiert sein.

## 2. Architektur & Code-Richtlinien

### A. Datenmodell & Schema-Änderungen
Wenn neue Spalten oder Felder zum Strommix hinzugefügt werden, müssen folgende Dateien synchronisiert werden:
1. `schema.sql`: Dokumentation des aktuellen Zustands.
2. `src/lib/parser/ai-extractor.ts`: Das Interface `DetailedEnergyMix` sowie der Extraktions-Prompt für Gemini.
3. `src/lib/scraper/save-helper.ts`: Die INSERT-Queries in `validateAndSaveMix`.
4. Dashboard UI & Provider-Modals (`src/components/...`): Anzeige der neuen Felder.
5. Tests: Mock-Daten in den Testdateien anpassen.

### B. Datenbank & Migrationen
- Die Datenbank ist PostgreSQL (Neon.com). (MariaDB-Code wurde entfernt).
- Modifikationen an der Live-Datenbank werden über idempotente (mehrfach ausführbare) TypeScript-Skripte in `scripts/` (z. B. `scripts/migrate-db.ts`) mittels `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` gelöst.

### C. Parsing-Kaskade (Regeln für Scraper-Logik)
- Verändere nicht die Reihenfolge der Kaskade in `runner.ts` (z. B. Gemini Vision -> Gemini Text -> Regex).
- Halte die Kern-Klassen `ScraperEngine` (`engine.ts`) und `runScrapeJob` (`runner.ts`) frei von komplexen Hilfsberechnungen. Nutze dafür die Hilfsdateien:
  - `src/lib/scraper/search-helper.ts` (für Such- und Rankinglogik)
  - `src/lib/scraper/save-helper.ts` (für Validierung und DB-Speicherung)

### D. Puppeteer-Ressourcen-Management
- Schließe geöffnete Puppeteer-Seiten (`page.close()`) immer in `finally`-Blöcken, um Speicherlecks zu verhindern.
- Die serverseitige PDF-Erstellung für A4-Berichte befindet sich in `src/lib/export.ts` und verwendet ebenfalls Puppeteer.

## 3. Testen & Qualitätssicherung
- Führe vor jedem Abschluss einer Aufgabe die Tests aus:
  `npm run test` (bzw. `npx vitest run`)
- Stelle sicher, dass alle bestehenden Tests grün bleiben.
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: add AGENTS.md guidelines"
```

---

### Task 2: Search Helper extrahieren

**Files:**
- Create: `src/lib/scraper/search-helper.ts`
- Modify: `src/lib/scraper/engine.ts`

- [ ] **Step 1: Erstelle search-helper.ts**
Verschiebe die Suchbewertungs- und Dokumentlink-Suchfunktionen aus `engine.ts` in die neue Datei.

```typescript
import { Page } from 'puppeteer';

export interface RawLink {
    href: string;
    text: string;
    title: string;
    ariaLabel: string;
    alt?: string;
}

const SKZ_KEYWORDS = [
    'stromkennzeichnung',
    'energiemix',
    'strommix',
    'energietraeger',
    'energy-mix',
    'strom-mix',
    'kennzeichnung',
    'energiequelle',
];

/**
 * Filter and rank search result links to avoid generic/irrelevant documents.
 * Returns ranked list with best matches first.
 */
export function filterAndRankLinks(links: string[], searchQuery: string): string[] {
    const blacklist = [
        'bdew.de',
        'wikipedia.org',
        'gesetze-im-internet.de',
        'bundesnetzagentur.de',
        'umweltbundesamt.de',
        'energieverbraucherportal.de',
    ];

    const providerName = searchQuery.split(' ')[0]?.toLowerCase() ?? '';

    const scored = links.map((url) => {
        const urlLower = url.toLowerCase();
        let score = 0;

        if (blacklist.some((domain) => urlLower.includes(domain))) {
            return { url, score: -1000 };
        }

        if (urlLower.endsWith('.pdf') || urlLower.includes('.pdf?')) {
            score += 150;
        }

        try {
            const hostname = new URL(url).hostname.toLowerCase();
            if (hostname.includes(providerName)) {
                score += 100;
            }
        } catch {
            // Invalid URL
        }

        if (urlLower.includes('stromkennzeichnung') || urlLower.includes('energiemix')) {
            score += 30;
        }

        const irrelevantKeywords = [
            'leitfaden', 'anleitung', 'guide', 'kontakt', 'netznutzer', 'mscons',
            'invoic', 'remadv', 'preisblatt', 'tarif', 'agb', 'datenschutz', 'impressum'
        ];
        if (irrelevantKeywords.some((kw) => urlLower.includes(kw))) {
            score -= 100;
        }

        return { url, score };
    });

    return scored
        .filter((item) => item.score > -1000)
        .sort((a, b) => b.score - a.score)
        .map((item) => item.url);
}

/**
 * Find document links (PDF, PNG, JPG) on an HTML page that are relevant to Stromkennzeichnung.
 * Returns scored + sorted results. PDFs rank higher than images.
 */
export async function findSkzDocumentLinks(page: Page): Promise<{ url: string; score: number; type: 'pdf' | 'image' }[]> {
    const rawLinks = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a')).map((a) => ({
            href: a.href,
            text: (a.textContent || '').toLowerCase().trim(),
            title: (a.getAttribute('title') || '').toLowerCase(),
            ariaLabel: (a.getAttribute('aria-label') || '').toLowerCase(),
        }));

        const images = Array.from(document.querySelectorAll('img')).map((img) => ({
            href: img.src,
            text: '',
            title: (img.getAttribute('title') || '').toLowerCase(),
            ariaLabel: (img.getAttribute('aria-label') || '').toLowerCase(),
            alt: (img.getAttribute('alt') || '').toLowerCase(),
        }));

        return [...links, ...images].filter((link) => !!link.href && link.href.startsWith('http'));
    });

    const scored: { url: string; score: number; type: 'pdf' | 'image' }[] = [];

    for (const link of rawLinks) {
        const hrefLower = link.href.toLowerCase();
        const isPdf = hrefLower.endsWith('.pdf') || hrefLower.includes('.pdf?') || hrefLower.includes('/pdf/');
        const isImage = /\.(png|jpe?g)(\?|$)/i.test(hrefLower);

        if (!isPdf && !isImage) continue;

        const alt = (link as any).alt || '';
        const combined = `${link.text} ${hrefLower} ${link.title} ${link.ariaLabel} ${alt}`;
        const hasKeyword = SKZ_KEYWORDS.some((kw) => combined.includes(kw));

        if (!hasKeyword) continue;

        let score = 0;

        if (isPdf) score += 50;
        if (isImage) score += 30;

        if (SKZ_KEYWORDS.some((kw) => hrefLower.includes(kw))) score += 30;
        if (SKZ_KEYWORDS.some((kw) => link.text.includes(kw) || alt.includes(kw))) score += 20;

        if (hrefLower.includes('logo') || hrefLower.includes('icon') || hrefLower.includes('banner')) {
            score -= 100;
        }

        if (score > 0) {
            scored.push({ url: link.href, score, type: isPdf ? 'pdf' : 'image' });
        }
    }

    const deduped = new Map<string, { url: string; score: number; type: 'pdf' | 'image' }>();
    for (const item of scored) {
        const existing = deduped.get(item.url);
        if (!existing || item.score > existing.score) {
            deduped.set(item.url, item);
        }
    }

    return [...deduped.values()].sort((a, b) => b.score - a.score);
}
```

- [ ] **Step 2: Passe engine.ts an**
Entferne die verschobenen Methoden und importiere sie stattdessen aus `search-helper.ts`.

```typescript
// in src/lib/scraper/engine.ts oben hinzufügen:
import { filterAndRankLinks, findSkzDocumentLinks } from './search-helper';
```
*(Und Entfernen der Methoden `filterAndRankLinks` und `findSkzDocumentLinks` am Dateiende).*

- [ ] **Step 3: Führe die Tests aus**
Führe `npx vitest run` aus.
Erwartet: Alle Tests bestehen weiterhin.

- [ ] **Step 4: Commit**

```bash
git add src/lib/scraper/search-helper.ts src/lib/scraper/engine.ts
git commit -m "refactor: extract search-helper logic from engine"
```

---

### Task 3: Save Helper extrahieren

**Files:**
- Create: `src/lib/scraper/save-helper.ts`
- Modify: `src/lib/scraper/runner.ts`

- [ ] **Step 1: Erstelle save-helper.ts**
Verschiebe `validateAndSaveMix` und `updateJobLog` in die neue Datei.

```typescript
import { query } from '@/lib/db';
import { DetailedEnergyMix } from '@/lib/parser/ai-extractor';

/**
 * Shared: Validate and save extracted energy mix data to DB.
 * Handles validation, INSERT, hkn_origins, and logging.
 * Returns the extracted year on success, null on failure.
 */
export async function validateAndSaveMix(
    mix: DetailedEnergyMix,
    documentId: number,
    providerId: number,
    jobId: number,
    logPrefix: string,
    successMsg: string
): Promise<number | null> {
    const sum = (mix.renewable ?? 0) + (mix.fossil ?? 0) + (mix.nuclear ?? 0);
    const warnings: string[] = [];

    if (mix.renewable === mix.fossil && mix.fossil === mix.nuclear && mix.renewable > 0) {
        warnings.push(`EE=FO=NU=${mix.renewable}% (identisch)`);
        mix.confidence = Math.min(mix.confidence, 10);
    }
    if (sum > 0 && Math.abs(sum - 100) > 5) {
        warnings.push(`Summe=${sum.toFixed(1)}%`);
        mix.confidence = Math.min(mix.confidence, 20);
    }
    if (mix.nuclear > 5 && mix.year >= 2024) {
        warnings.push(`Nuklear=${mix.nuclear}% nach Atomausstieg`);
        mix.confidence = Math.min(mix.confidence, 30);
    }
    if (mix.renewable > 100 || mix.fossil > 100 || mix.nuclear > 100) {
        warnings.push(`Wert >100%`);
        mix.confidence = Math.min(mix.confidence, 5);
    }

    if (warnings.length > 0) {
        console.warn(`  [VALIDATE ${logPrefix}] ⚠️ ${warnings.join('; ')}`);
    }

    if (sum > 150) {
        console.error(`  [VALIDATE ${logPrefix}] ❌ Summe ${sum.toFixed(1)}% > 150% — verworfen`);
        await updateJobLog(jobId, `Extraktion verworfen: Summe=${sum.toFixed(1)}% (>150%)`);
        return null;
    }

    console.log(`  [${logPrefix}] ✅ Data found (method: ${mix.extraction_method}, confidence: ${mix.confidence}%)`);
    console.log(
        `  [${logPrefix}]    Year: ${mix.year} | RE: ${mix.renewable}% | Fossil: ${mix.fossil}% | Nuclear: ${mix.nuclear}% | Sum: ${sum.toFixed(1)}%`
    );

    try {
        const insertResult: any = await query(
            `INSERT INTO energy_mix (
                document_id, provider_id, year,
                renewable_percentage, fossil_percentage, nuclear_percentage,
                wind_percentage, solar_percentage, biomass_percentage, hydro_percentage, other_renewable_percentage,
                coal_percentage, natural_gas_percentage, other_fossil_percentage,
                eeg_funded_percentage, hkn_percentage, mieterstrom_percentage,
                co2_emission_g_kwh, radioactive_waste_mg_kwh,
                eeg_percentage, tariff_name, confidence, extraction_method, mix_type
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                documentId,
                providerId,
                mix.year,
                mix.renewable,
                mix.fossil,
                mix.nuclear,
                mix.wind,
                mix.solar,
                mix.biomass,
                mix.hydro,
                mix.other_renewable,
                mix.coal,
                mix.natural_gas,
                mix.other_fossil,
                mix.eeg_funded ?? null,
                mix.hkn ?? null,
                mix.mieterstrom ?? null,
                mix.co2,
                mix.waste,
                mix.eeg_percentage,
                mix.tariff_name,
                mix.confidence,
                mix.extraction_method,
                mix.mix_type ?? null,
            ]
        );
        const mixId = Number(insertResult.insertId);

        if (mix.hkn_origins && mix.hkn_origins.length > 0) {
            for (const origin of mix.hkn_origins) {
                await query('INSERT INTO hkn_origins (energy_mix_id, country, percentage) VALUES (?, ?, ?)', [
                    mixId,
                    origin.country,
                    origin.percentage,
                ]);
            }
            console.log(`  [${logPrefix}] ${mix.hkn_origins.length} HKN-Herkunftsländer gespeichert`);
        }

        const validationNote = warnings.length > 0 ? ` ⚠️ ${warnings.join('; ')}` : '';
        console.log(`  [${logPrefix}] Mix data saved to DB.`);
        await updateJobLog(
            jobId,
            `${successMsg} (${mix.extraction_method}, ${mix.confidence}% Konfidenz)${validationNote}`
        );
        return mix.year ?? null;
    } catch (e: any) {
        if (e.code === 'ER_DUP_ENTRY') {
            console.warn(`  [${logPrefix}] Mix data already exists for this document.`);
        } else {
            console.error(`  [${logPrefix}] Failed to save: ${e.message}`);
        }
        return mix.year ?? null;
    }
}

/**
 * Helper: Update the log_message of a running job.
 */
export async function updateJobLog(jobId: number, message: string) {
    await query('UPDATE scrape_jobs SET log_message = ? WHERE id = ?', [message, jobId]);
}
```

- [ ] **Step 2: Passe runner.ts an**
Entferne die verschobenen Methoden aus `runner.ts` und importiere sie aus `save-helper.ts`.

```typescript
// in src/lib/scraper/runner.ts oben hinzufügen:
import { validateAndSaveMix, updateJobLog } from './save-helper';
```
*(Und Entfernen der lokalen Implementierungen von `validateAndSaveMix` und `updateJobLog`).*

- [ ] **Step 3: Führe die Tests aus**
Führe `npx vitest run` aus.
Erwartet: Alle Tests bestehen weiterhin.

- [ ] **Step 4: Commit**

```bash
git add src/lib/scraper/save-helper.ts src/lib/scraper/runner.ts
git commit -m "refactor: extract save-helper logic from runner"
```

---

### Task 4: Unit-Tests aktualisieren

**Files:**
- Modify: `src/lib/scraper/engine.test.ts`

- [ ] **Step 1: Teste search-helper.ts direkt**
Statt der Kopiervorlage in `engine.test.ts` importieren wir jetzt die extrahierten Funktionen aus `search-helper.ts` direkt und führen die Tests dagegen aus.

Ersetze Zeilen 9–72 in `src/lib/scraper/engine.test.ts` mit:
```typescript
import { scoreDocumentLinks } from './search-helper'; // Falls wir scoreDocumentLinks exportieren, andernfalls verwenden wir direkt findSkzDocumentLinks oder die Scoring-Hilfsfunktion aus search-helper.ts
```
*Alternativ:* Wir exportieren auch die reine Scoring-Hilfsfunktion `scoreDocumentLinks` in `search-helper.ts`, um Unit-Tests extrem einfach zu halten.

Modifiziere `search-helper.ts` am Ende und exportiere eine Funktion `scoreDocumentLinks`:
```typescript
export function scoreDocumentLinks(rawLinks: any[]): { url: string; score: number; type: 'pdf' | 'image' }[] {
    // ... reine Scoring-Berechnung für Unit-Tests ...
}
```
Und nutze sie sowohl in `findSkzDocumentLinks` als auch in `engine.test.ts`.

- [ ] **Step 2: Führe die Tests aus**
Führe `npx vitest run` aus.
Erwartet: Alle Tests bestehen weiterhin.

- [ ] **Step 3: Commit**

```bash
git add src/lib/scraper/engine.test.ts src/lib/scraper/search-helper.ts
git commit -m "test: update unit tests to use search-helper directly"
```
