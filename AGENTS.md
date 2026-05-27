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
