# Spec: Codebase Refactoring & AI Guidelines (SKZ-Scraper)

## Übersicht

Dieses Dokument beschreibt die geplante Refactoring-Maßnahme für den SKZ-Scraper, um die wachsende Komplexität zu bändigen. Ziel ist es, die monolithischen Logikblöcke aus `engine.ts` (Such- und Linkbewertung) und `runner.ts` (Speicher- und Validierungslogik) in wiederverwendbare Helper-Module auszulagern und gleichzeitig ein dauerhaftes Regelwerk für KI-Assistenten (`AGENTS.md`) im Root-Verzeichnis zu etablieren.

## Geplante Änderungen

### 1. Auslagerung der Such- und Bewertungslogik
Wir lagern die für die DuckDuckGo-Suche und Link-Selektion zuständigen Methoden aus `engine.ts` aus.

- **[NEW] [search-helper.ts](file:///c:/Users/marti/Documents/CODE/SKZ-Scraper/src/lib/scraper/search-helper.ts)**:
  - `filterAndRankLinks(links: string[], searchQuery: string): string[]`: Logik zur Filterung von Domains (Blacklist) und Bewertung von Suchergebnissen.
  - `findSkzDocumentLinks(page: Page): Promise<{ url: string; score: number; type: 'pdf' | 'image' }[]>`: Suche und Bewertung von relevanten Dokumentenlinks auf einer geladenen HTML-Seite.
- **[MODIFY] [engine.ts](file:///c:/Users/marti/Documents/CODE/SKZ-Scraper/src/lib/scraper/engine.ts)**:
  - Entfernung der Methoden `filterAndRankLinks` und `findSkzDocumentLinks`.
  - Importieren und Verwenden dieser Funktionen aus `search-helper.ts`.

### 2. Auslagerung der Validierungs- und Speicherlogik
Wir lagern die Logik zur Datenbank-Speicherung und Validierung aus `runner.ts` aus.

- **[NEW] [save-helper.ts](file:///c:/Users/marti/Documents/CODE/SKZ-Scraper/src/lib/scraper/save-helper.ts)**:
  - `validateAndSaveMix(mix: DetailedEnergyMix, documentId: number, providerId: number, jobId: number, logPrefix: string, successMsg: string): Promise<number | null>`: Plausibilitätsprüfung des Energiemixes, Ausführen des `INSERT` in `energy_mix`, sowie Speichern der HKN-Herkunftsländer in `hkn_origins`.
  - `updateJobLog(jobId: number, message: string)`: Hilfsfunktion zum Aktualisieren des Scraping-Job-Status.
- **[MODIFY] [runner.ts](file:///c:/Users/marti/Documents/CODE/SKZ-Scraper/src/lib/scraper/runner.ts)**:
  - Entfernung der Methoden `validateAndSaveMix` und `updateJobLog`.
  - Importieren und Verwenden dieser Funktionen aus `save-helper.ts`.

### 3. Etablierung des KI-Regelwerks
Wir erstellen ein dauerhaftes Regelwerk für KI-Assistenten im Hauptverzeichnis des Projekts.

- **[NEW] [AGENTS.md](file:///c:/Users/marti/Documents/CODE/SKZ-Scraper/AGENTS.md)**:
  - Enthält Benutzerpräferenzen (Deutsch, Windows-Kompatibilität).
  - Listet Verhaltensregeln auf (z. B. automatisches Update der `README.md` und `task.md` bei erfolgreicher Feature-Umsetzung).
  - Definiert Architektur-Konventionen (Parsing-Kaskade, Synchronisation bei Schema-Erweiterungen, Schließen von Puppeteer-Ressourcen).

## Verifikationsplan

### Automatisierte Tests
- Ausführen der bestehenden Test-Suite mit `npm run test` bzw. `npx vitest run`.
- Alle 25+ Tests (insb. `engine.test.ts` und die Parser-Tests) müssen unverändert grün bleiben.

### Manuelle Verifikation
- Ausführen eines Test-Scraps für einen einzelnen Anbieter via CLI (`npx tsx scripts/test-single-provider.ts`) zur Überprüfung der Funktionalität von Such-Helper, Scraper-Engine und Save-Helper im Zusammenspiel.
