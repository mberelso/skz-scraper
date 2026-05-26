# SKZ-Cockpit: Architektur-Review & Qualitätsbericht

**Datum:** 2026-03-12
**Reviewer:** Claude Opus 4.6

---

## 1. Executive Summary

Das SKZ-Cockpit ist eine Next.js-Anwendung zur automatisierten Erfassung und Analyse von Stromkennzeichnungsdaten deutscher Energieversorger. Die Architektur ist grundsätzlich solide (3-stufige Extraktionspipeline, MariaDB-Schema, Live-Polling), aber es gibt **kritische Probleme in Datenqualität, Sicherheit und dem regulatorischen Workflow**, die vor einem produktiven Einsatz durch Behördenmitarbeiter nach § 42 EnWG behoben werden müssen.

### Kennzahlen aus den funktionalen Tests:

| Metrik | Wert | Bewertung |
|---|---|---|
| Provider gesamt | 966 | OK |
| Provider mit Strommix-Daten | 49 (5,1%) | **Kritisch niedrig** |
| Davon mit identischen EE/FO/NU-Werten | 13 (26,5%) | **Fehlerhaft** |
| Davon mit Summe != 100% (>5% Abweichung) | 36 (73,5%) | **Fehlerhaft** |
| POST /api/energy-mix | BigInt-Fehler | **Kaputt** |
| Authentifizierung | Keine | **Kritisch** |

---

## 2. Kritische Bugs (sofort beheben)

### 2.1 BigInt-Serialisierungsfehler in Energy-Mix POST
- **Datei:** `src/app/api/energy-mix/route.ts:78`
- `result.insertId` ist ein BigInt aus dem MariaDB-Treiber
- **Fix:** `Number(result.insertId)` verwenden
- **Status:** [ ] Offen

### 2.2 Falsy-Value-Bug mit `|| null`
- **Dateien:** `src/app/api/energy-mix/route.ts:55-69`, `src/app/api/export/csv/route.ts:84-91`
- `renewable_percentage || null` → 0% wird zu null
- **Fix:** `??` (Nullish Coalescing) statt `||` verwenden
- **Status:** [ ] Offen

### 2.3 Schwere Datenqualitätsprobleme bei der Extraktion
- **Dateien:** `src/lib/parser/regex-extractor.ts`, `src/lib/parser/ai-extractor.ts`, `src/lib/scraper/runner.ts`
- 13/49 Provider haben identische EE/FO/NU-Werte (Extraktionsfehler)
- 36/49 Provider haben Summe != 100% (>5% Abweichung)
- **Fix:** Nachvalidierung + Regex-Suchradien reparieren
- **Status:** [ ] Offen

---

## 3. Sicherheitsprobleme

### 3.1 KRITISCH: Keine Authentifizierung
- Alle 12 API-Endpunkte sind öffentlich zugänglich
- **Status:** [ ] Offen

### 3.2 HOCH: SSRF-Schwachstelle
- `src/app/api/scrape/route.ts:23` — URL wird ohne Validierung an Puppeteer weitergeleitet
- **Status:** [ ] Offen

### 3.3 HOCH: SQL-Interpolation
- `src/app/api/scrape-batch/route.ts:50` — `LIMIT ${limit}` per String-Interpolation
- **Status:** [ ] Offen

### 3.4 MITTEL: CSV-Injection
- Provider-Namen mit `=`, `+`, `-`, `@` könnten in Excel als Formeln interpretiert werden
- **Status:** [x] Behoben (csvSafe-Funktion mit Prefix-Escaping)

### 3.5 MITTEL: Error-Messages verraten interne Details
- Alle API-Routes geben `error.message` direkt an den Client zurück
- **Status:** [ ] Offen

---

## 4. Frontend / UX-Probleme

### 4.1 KRITISCH: Keine Such- und Filterfunktion
- 966 Provider ohne Suche/Filter → größter Blocker für § 42 EnWG-Workflow
- **Status:** [ ] Offen

### 4.2 KRITISCH: Kein Audit-Trail
- Änderungen werden ohne Protokoll überschrieben
- **Status:** [ ] Offen

### 4.3 HOCH: HTML `lang="en"` statt `lang="de"`
- `src/app/layout.tsx:26`
- **Status:** [ ] Offen

### 4.4 HOCH: Seitentitel ist Next.js-Boilerplate
- `src/app/layout.tsx:15-18` — "Create Next App"
- **Status:** [ ] Offen

### 4.5 HOCH: Status-Labels in Englisch
- success/failed/running/partial statt deutsche Begriffe
- **Status:** [ ] Offen

### 4.6 HOCH: CSV-Header in Englisch
- Export-Spalten sollten deutsch sein
- **Status:** [ ] Offen

### 4.7 MITTEL: URL-Parsing ohne try/catch
- `src/components/ProviderModal.tsx` — `new URL()` crasht bei ungültigen URLs
- **Status:** [ ] Offen

### 4.8 MITTEL: Modal ohne Accessibility
- Kein `role="dialog"`, kein Focus-Trap, kein Escape
- **Status:** [ ] Offen

### 4.9 NIEDRIG: ProviderRow.tsx ist toter Code
- Wird nirgends importiert
- **Status:** [ ] Offen

### 4.10 NIEDRIG: page.module.css ist Boilerplate
- 142 Zeilen ungenutztes CSS
- **Status:** [ ] Offen

---

## 5. Performance & Architektur

### 5.1 N+1-Query-Pattern
- 7-8 korrelierte Subqueries pro Provider-Zeile
- **Status:** [ ] Offen

### 5.2 Fehlender DB-Index
- `scrape_jobs(provider_id, id DESC)` fehlt
- **Status:** [ ] Offen

### 5.3 Globaler State für Batch
- Module-level Variablen, nicht Multi-Worker-fähig
- **Status:** [ ] Offen

### 5.4 Kein PDF-Größenlimit
- PDFs komplett in Speicher ohne Limit
- **Status:** [ ] Offen

### 5.5 Doppelte PDF-Textextraktion
- `extractTextFromPdf()` wird in Strategie 2 und 3 separat aufgerufen
- **Status:** [ ] Offen

---

## 6. § 42 EnWG Bewertung

| Anforderung | Status | Bewertung |
|---|---|---|
| Vollständige Provider-Liste | 966 Provider vorhanden | OK |
| Automatisierte Datenerfassung | 3-Stufen-Pipeline | OK (Konzept) |
| Datenqualität der Extraktion | 73,5% fehlerhaft | **Unbrauchbar** |
| Suche/Filter nach Providern | Nicht vorhanden | **Fehlt komplett** |
| Prüfstatus "Geprüft/Offen" | Nicht vorhanden | **Fehlt komplett** |
| Vergleich mit Bundesmix | Nicht vorhanden | **Fehlt** |
| Plausibilitätsprüfung (Summe=100%) | Nicht vorhanden | **Fehlt** |
| Audit-Trail | Nicht vorhanden | **Fehlt komplett** |
| Notizen/Aktenvermerke | Nicht vorhanden | **Fehlt** |
| Gefilterte Exports | Nur Komplett-Export | **Unzureichend** |
| Authentifizierung | Nicht vorhanden | **Fehlt komplett** |
| Daten-Archivierung | PDF-Speicherung vorhanden | OK |
| Manuelle Nacherfassung | Implementiert (BigInt-Bug) | Fast OK |

---

## 7. Priorisierte Verbesserungsliste

### Priorität 1 — Sofort (Blocking Bugs) — ERLEDIGT 2026-03-12
- [x] 1. BigInt-Fix in energy-mix/route.ts → `Number(result.insertId)`
- [x] 2. `|| null` → `?? null` in energy-mix und csv-export (inkl. CSV-Injection-Schutz, dt. Header, Semikolon-Separator, BOM)
- [x] 3. Nachvalidierung der Extraktion: Summe≈100%, identische Werte, Nuklear nach Atomausstieg, Werte >100%
- [x] 4. Regex-Extractor: Nur Forward-Suche (100 statt 200 Zeichen), Position-Claiming verhindert Doppelmatches

### Priorität 2 — Kurzfristig — ERLEDIGT 2026-03-12
- [x] 5. Suchleiste im Dashboard (Freitext über Name/Stadt/PLZ/Aktenzeichen + Ergebniszähler)
- [x] 6. Status-Filter (Alle/Erfolgreich/Fehlgeschlagen/Teilweise/Laufend/Nie gescrapt) + Daten-Filter (Mit/Ohne Strommix/Niedrige Konfidenz)
- [x] 7. `lang="de"` und Seitentitel → "SKZ-Cockpit — Stromkennzeichnungs-Datenbank"
- [x] 8. Status-Labels deutsch (Erfolgreich/Fehlgeschlagen/Laufend/Teilweise/Wartend)
- [x] 9. CSV-Header deutsch (bereits in P1.2 erledigt)
- [x] 10. URL-Parsing absichern (try/catch um new URL())

### Priorität 3 — Mittelfristig (1 Monat) — ERLEDIGT
- [x] 11. Authentifizierung (Cookie + API-Key, Login-Seite, Middleware, Logout)
- [x] 12. Audit-Trail (audit_log Tabelle, logAudit() Helper, UI im Modal)
- [x] 13. Prüfstatus-Feld (ENUM offen/geprueft/beanstandet, Dropdown im Dashboard, Filter)
- [x] 14. Plausibilitätswarnung (Warn-Icon im Dashboard + Warnbox im Modal bei Summe!=100%)
- [x] 15. Bundesmix-Vergleich (BDEW-Referenzdaten 2020-2023, Abweichung in Prozentpunkten)
- [x] 16. Gefilterte CSV-Exports (Query-Params, inkl. Prüfstatus, Dateiname -gefiltert)
- [x] 17. DB-Index scrape_jobs (idx_provider_latest auf provider_id, id DESC)

### Priorität 4 — Langfristig
- [ ] 18. Notiz-/Aktenvermerke
- [ ] 19. Accessibility (Modal-ARIA, Focus-Trap)
- [ ] 20. Pagination/Virtual Scrolling
- [ ] 21. PDF-Größenlimit
- [ ] 22. Rate-Limiting
- [ ] 23. Toter Code entfernen
