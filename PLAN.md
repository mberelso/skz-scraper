# Plan: Datenmodell-Erweiterung (HKN-Herkunftsländer + EE-Unterkategorien)

## Übersicht

Erweiterung des Datenmodells um:

- A) 3 neue Spalten in `energy_mix` (eeg_funded, hkn, mieterstrom)
- B) Neue Tabelle `hkn_origins` (Herkunftsländer der HKN)
- C) Gemini-Prompt erweitern (hkn_origins Array)
- D) Alle INSERT/SELECT/Interface-Stellen aktualisieren
- E) Migration-Script + Schema

## Schritte

### 1. Migration-Script + Schema

- `scripts/add-hkn-columns.ts`: ALTER TABLE energy_mix + CREATE TABLE hkn_origins
- `schema.sql` aktualisieren

### 2. DetailedEnergyMix Interface erweitern

- `ai-extractor.ts`: Neue Felder `eeg_funded`, `hkn`, `mieterstrom`, `hkn_origins`
- `parseGeminiResponse()`: Neue Felder durchreichen statt droppen

### 3. Gemini-Prompt erweitern

- `EXTRACTION_PROMPT`: `hkn_origins` Array hinzufügen

### 4. Runner.ts: 3x INSERT aktualisieren

- `parseAndSaveMix`, `parseAndSaveMixFromHtml`, `parseAndSaveMixFromImage`
- Nach INSERT: hkn_origins speichern

### 5. Energy-Mix API (POST/PATCH)

- Neue Felder in POST/PATCH akzeptieren
- hkn_origins CRUD

### 6. Archive-Query + ProviderModal

- Documents-Query: neue Felder selektieren
- ProviderModal: EE-Aufschlüsselung + HKN-Herkunftsländer anzeigen

### 7. Tests

- Bestehende 25 Tests müssen grün bleiben
