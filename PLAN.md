# Plan: Datenmodell-Erweiterung (HKN-Herkunftsländer + EE-Unterkategorien)

## Übersicht

Erweiterung des Datenmodells um:

- [x] A) 3 neue Spalten in `energy_mix` (eeg_funded, hkn, mieterstrom)
- [x] B) Neue Tabelle `hkn_origins` (Herkunftsländer der HKN)
- [x] C) Gemini-Prompt erweitern (hkn_origins Array)
- [x] D) Alle INSERT/SELECT/Interface-Stellen aktualisieren
- [x] E) Migration-Script + Schema

## Schritte

### 1. Migration-Script + Schema [ERLEDIGT]

- [x] `scripts/add-hkn-columns.ts`: ALTER TABLE energy_mix + CREATE TABLE hkn_origins ausgeführt
- [x] `schema.sql` aktualisiert

### 2. DetailedEnergyMix Interface erweitern [ERLEDIGT]

- [x] `ai-extractor.ts`: Neue Felder `eeg_funded`, `hkn`, `mieterstrom`, `hkn_origins` hinzugefügt
- [x] `parseGeminiResponse()`: Neue Felder durchreichen statt droppen

### 3. Gemini-Prompt erweitern [ERLEDIGT]

- [x] `EXTRACTION_PROMPT`: `hkn_origins` Array im Prompt und Antwortformat ergänzt

### 4. Runner.ts: 3x INSERT aktualisieren [ERLEDIGT]

- [x] `parseAndSaveMix`, `parseAndSaveMixFromHtml`, `parseAndSaveMixFromImage` angepasst (durch gemeinsame Nutzung von `validateAndSaveMix`)
- [x] Nach INSERT: hkn_origins speichern in `save-helper.ts`

### 5. Energy-Mix API (POST/PATCH) [ERLEDIGT]

- [x] Neue Felder in POST/PATCH akzeptieren
- [x] hkn_origins CRUD im API-Endpunkt integriert

### 6. Archive-Query + ProviderModal [ERLEDIGT]

- [x] Documents-Query: neue Felder selektieren
- [x] ProviderModal: EE-Aufschlüsselung + HKN-Herkunftsländer anzeigen

### 7. Tests [ERLEDIGT]

- [x] Bestehende 34 Tests laufen erfolgreich durch (`npm run test`)
