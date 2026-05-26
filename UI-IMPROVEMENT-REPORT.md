# SKZ-Cockpit UI-Verbesserungs-Bericht

**Datum:** 2026-03-17
**Projekt:** Stromkennzeichnungs-Datenbank (§ 42 EnWG)
**Status:** Vorschlagsphase

---

## 📊 1. Reports & Analytics

### 1.1 Compliance-Dashboard ⭐⭐⭐

**Beschreibung:** Übersicht über den Compliance-Status aller Provider

**Features:**

- Compliance-Ampel (Rot/Gelb/Grün basierend auf Aktualität der Daten)
- "Kritische Provider" Liste (keine Daten, veraltete Daten >2 Jahre)
- Automatische Compliance-Prüfung nach § 42 EnWG Kriterien
- Export als PDF-Report für Behörden

**Technische Komplexität:** Mittel
**Nutzen:** Hoch (Kernfunktion für Compliance-Überwachung)

---

### 1.2 Trend-Analyse Dashboard ⭐⭐⭐

**Beschreibung:** Visualisierung der Entwicklung von Strommix-Daten über Zeit

**Features:**

- Zeitreihen-Charts: EE-Anteil, Fossile, Nuklear über Jahre
- Vergleich: Bundesschnitt vs. Provider-Durchschnitt
- Top 10 / Bottom 10 EE-Anbieter
- Prognose-Trends basierend auf historischen Daten
- Filter nach Stadt, PLZ-Bereich, Prüfstatus

**Visualisierungen:**

- Line Charts (Zeitreihen)
- Bar Charts (Top/Bottom Ranking)
- Pie Charts (Strommix-Verteilung)
- Heatmap (Regionale Verteilung)

**Technische Komplexität:** Mittel-Hoch (Chart-Library wie Recharts/Chart.js)
**Nutzen:** Sehr hoch (Strategische Einblicke)

---

### 1.3 Geo-Visualisierung 🗺️ ⭐⭐

**Beschreibung:** Interaktive Karte mit Provider-Verteilung

**Features:**

- Deutschlandkarte mit Markern pro Provider
- Farbcodierung nach EE-Anteil (grün = hoch, rot = niedrig)
- Cluster bei vielen Providern in einer Region
- Klick auf Marker öffnet Provider-Details
- Filter nach PLZ, Bundesland, Prüfstatus

**Technische Komplexität:** Mittel-Hoch (Leaflet/Mapbox Integration)
**Nutzen:** Mittel (Nice-to-have, gut für Präsentationen)

---

### 1.4 Advanced Export Center ⭐⭐

**Beschreibung:** Verschiedene Export-Formate für unterschiedliche Zielgruppen

**Export-Typen:**

- **Behörden-Report:** PDF mit Compliance-Übersicht, Tabellen, Diagrammen
- **Excel-Export:** Rohdaten mit Pivot-Tabellen vorbereitet
- **CSV-Export:** Bereits vorhanden, erweitern um Filter-Presets
- **JSON-Export:** Für API-Konsumenten
- **Audit-Trail-Export:** Alle Änderungen eines Providers

**Features:**

- Template-System für Reports
- Automatisches Branding (Logo, Farben)
- Scheduled Exports (wöchentlich, monatlich)

**Technische Komplexität:** Mittel
**Nutzen:** Hoch (wichtig für externe Kommunikation)

---

### 1.5 Scraping-Performance-Dashboard ⭐

**Beschreibung:** Analyse der Scraping-Erfolgsquoten

**Metriken:**

- Success Rate pro Provider (historisch)
- Durchschnittliche Scraping-Dauer
- Fehlerquellen-Analyse (404, Timeout, Parse-Fehler)
- AI-Confidence-Score-Verteilung
- OCR vs. Gemini vs. Regex Erfolgsraten

**Visualisierungen:**

- Success Rate Trend-Chart
- Error Distribution Pie Chart
- Confidence Score Histogram

**Technische Komplexität:** Niedrig-Mittel
**Nutzen:** Mittel (gut für Optimierung, weniger für User)

---

## 🔍 2. Erweiterte Suchfunktionen

### 2.1 Advanced Search Builder ⭐⭐⭐

**Beschreibung:** Komplexe Filterabfragen mit UND/ODER-Verknüpfung

**Features:**

- Query Builder UI (z.B. wie QueryBuilder von react-querybuilder)
- Kombinierbare Filter:
    - EE-Anteil: > 50%, < 30%, zwischen X-Y
    - Confidence: niedrig/mittel/hoch
    - Stadt: beginnt mit, enthält
    - Scraping-Datum: älter als X Tage, im Zeitraum
    - Review-Status: Offen UND Confidence < 40%
- Gespeicherte Suchen ("Kritische Provider", "Hohe EE-Anbieter", etc.)
- Suche speichern & teilen (URL mit Query-Params)

**Technische Komplexität:** Mittel
**Nutzen:** Hoch (Power-User-Feature)

---

### 2.2 Volltextsuche in Dokumenten ⭐⭐

**Beschreibung:** Suche in gespeicherten PDF/Image-Dokumenten

**Features:**

- OCR-Text durchsuchbar machen (bereits extrahiert, in DB speichern)
- Suche nach Schlagwörtern in allen Dokumenten
- Highlight der Fundstellen im PDF-Viewer
- Filter: nur Dokumente mit bestimmten Keywords

**Technische Komplexität:** Mittel-Hoch (OCR-Text-Indexierung)
**Nutzen:** Mittel (für spezielle Use-Cases nützlich)

---

## ✏️ 3. Eingabemasken & Workflows

### 3.1 Bulk-Edit-Modus ⭐⭐⭐

**Beschreibung:** Mehrere Provider gleichzeitig bearbeiten

**Features:**

- Multi-Select in Tabelle (Checkboxen)
- Batch-Aktionen:
    - Review-Status für X Provider auf "Geprüft" setzen
    - Priorität für Auswahl ändern
    - Notiz für alle ausgewählten hinzufügen
    - Batch-Scraping für Auswahl starten
- Undo-Funktion für Bulk-Edits

**Technische Komplexität:** Mittel
**Nutzen:** Sehr hoch (spart viel Zeit bei vielen Providern)

---

### 3.2 CSV/Excel-Import ⭐⭐

**Beschreibung:** Provider-Daten aus CSV/Excel importieren

**Features:**

- Drag & Drop Upload
- Column-Mapping (welche Spalte = Name, URL, etc.)
- Vorschau vor Import
- Validierung (doppelte Namen, ungültige URLs)
- Update-Modus (bestehende Provider aktualisieren) vs. Insert-Modus

**Use-Cases:**

- Initiale Provider-Liste importieren
- Bulk-Update von Aktenzeichen oder URLs
- Migration aus Altdaten

**Technische Komplexität:** Mittel
**Nutzen:** Hoch (wichtig für initiales Setup & Migrationen)

---

### 3.3 Template-Manager für SKZ-URLs ⭐

**Beschreibung:** URL-Patterns für häufige Provider-Typen speichern

**Beispiel-Templates:**

- Stadtwerke: `https://www.stadtwerke-{city}.de/stromkennzeichnung`
- Energiewerke: `https://www.{name}.de/privatkunden/strom/kennzeichnung`

**Features:**

- Template-Bibliothek anlegen
- Bei neuem Provider: Template auswählen → Variablen füllen
- Auto-Suggest basierend auf Provider-Name

**Technische Komplexität:** Niedrig
**Nutzen:** Mittel (spart Zeit bei manueller Eingabe)

---

### 3.4 Review-Workflow mit Genehmigung ⭐⭐

**Beschreibung:** Mehrstufiger Prüfprozess für kritische Daten

**Workflow:**

1. Scraping extrahiert Daten → Status "Offen"
2. Sachbearbeiter prüft → Status "Zur Genehmigung"
3. Vorgesetzter genehmigt → Status "Geprüft"

**Features:**

- Rollen-System (Sachbearbeiter, Prüfer, Admin)
- Kommentar-Funktion bei Ablehnung
- Email-Benachrichtigungen bei Status-Änderung
- Dashboard: "Meine zu prüfenden Einträge"

**Technische Komplexität:** Hoch (Auth + Rollen + Workflow-Engine)
**Nutzen:** Mittel-Hoch (für größere Teams wichtig)

---

### 3.5 Dokumenten-Upload mit OCR ⭐⭐

**Beschreibung:** Manuelle PDF/Bild-Uploads mit automatischer Extraktion

**Features:**

- Drag & Drop Upload im Provider-Modal
- Automatische Analyse mit Gemini/Tesseract
- Formular wird vorbefüllt mit extrahierten Daten
- User kann korrigieren vor dem Speichern
- Versionierung (mehrere Dokumente pro Provider/Jahr)

**Bereits teilweise vorhanden:** Upload-API existiert, aber UI fehlt noch

**Technische Komplexität:** Niedrig (Backend existiert, nur UI bauen)
**Nutzen:** Hoch (wichtig für manuelle Fälle)

---

## 📈 4. Visualisierungen & Dashboards

### 4.1 Strommix-Verteilungs-Chart ⭐⭐⭐

**Beschreibung:** Aggregierte Visualisierung aller Provider-Daten

**Charts:**

- **Stacked Bar Chart:** Durchschnittlicher Strommix (EE / Fossil / Nuklear)
- **Box Plot:** Verteilung der EE-Anteile (Median, Quartile, Ausreißer)
- **Scatter Plot:** EE-Anteil vs. CO₂-Emissionen
- **Histogram:** Häufigkeitsverteilung der Confidence-Scores

**Filter:**

- Jahr auswählen
- Nach Stadt/PLZ filtern
- Nur geprüfte Daten

**Technische Komplexität:** Mittel (Chart-Library)
**Nutzen:** Sehr hoch (Kern-Analytics)

---

### 4.2 Echtzeit-Scraping-Monitor ⭐

**Beschreibung:** Live-Visualisierung laufender Scraping-Jobs

**Features:**

- Fortschrittsbalken pro Provider
- Log-Stream im Terminal-Stil
- Fehler-Highlighting
- "Pause/Resume"-Funktionen
- WebSocket für Echtzeit-Updates (statt Polling)

**Technische Komplexität:** Mittel-Hoch (WebSocket-Integration)
**Nutzen:** Niedrig-Mittel (Nice-to-have für Power-User)

---

### 4.3 Compliance-Ampel (Widget) ⭐⭐

**Beschreibung:** Schneller Status-Überblick als Ampel-Widget

**Logik:**

- 🟢 **Grün:** Daten < 1 Jahr alt, Confidence > 70%, Geprüft
- 🟡 **Gelb:** Daten 1-2 Jahre alt ODER Confidence 40-70% ODER Offen
- 🔴 **Rot:** Daten > 2 Jahre alt ODER Confidence < 40% ODER Beanstandet

**Darstellung:**

- Große Ampel auf Dashboard (Prozent-Anzeige pro Farbe)
- Mini-Ampel in Provider-Tabelle (Spalte)
- Drill-Down: Klick auf Rot → Liste aller roten Provider

**Technische Komplexität:** Niedrig
**Nutzen:** Sehr hoch (schneller Überblick)

---

## 🔔 5. Benachrichtigungen & Automation

### 5.1 Alert-System ⭐⭐

**Beschreibung:** Benachrichtigungen bei kritischen Ereignissen

**Trigger:**

- Provider-Daten älter als 2 Jahre
- Scraping fehlgeschlagen > 3x hintereinander
- Neue Beanstandung
- Batch-Job abgeschlossen

**Kanäle:**

- In-App-Notifications (Bell-Icon im Header)
- Email-Benachrichtigungen
- Optional: Slack/Teams-Integration

**Technische Komplexität:** Mittel
**Nutzen:** Hoch (proaktive Überwachung)

---

### 5.2 Scheduled Jobs ⭐

**Beschreibung:** Automatisches Scraping nach Zeitplan

**Features:**

- Cron-Job-Editor (UI für Cron-Expression)
- Z.B. "Alle Provider mit Priorität > 80 jeden Montag um 6 Uhr scrapen"
- Job-History: Wann lief welcher Job?
- Enable/Disable Jobs

**Technische Komplexität:** Mittel (Cron-Integration)
**Nutzen:** Hoch (Automatisierung spart Zeit)

---

## 🛠️ 6. Datenqualität & Validierung

### 6.1 Validierungs-Dashboard ⭐⭐

**Beschreibung:** Automatische Plausibilitätsprüfungen

**Checks:**

- Summe EE + Fossil + Nuklear = 100%? (Warnung bei Abweichung)
- CO₂-Wert plausibel für gegebenen Mix?
- Nuklear-Anteil > 0 nach 2023? (Warnung, da AKW-Ausstieg)
- Provider ohne URL oder SKZ-URL
- Duplikate (gleicher Name, ähnliche Adresse)

**Darstellung:**

- Warnings-Liste mit Schweregrad (Error / Warning / Info)
- Bulk-Fix-Aktionen ("Alle Summen auf 100% normalisieren")
- Export als Excel für manuelle Nachbearbeitung

**Technische Komplexität:** Niedrig-Mittel
**Nutzen:** Hoch (verbessert Datenqualität)

---

### 6.2 Duplikate-Erkennung ⭐

**Beschreibung:** Automatische Erkennung doppelter Provider

**Algorithmus:**

- Fuzzy-Matching von Namen (Levenshtein-Distanz)
- Gleiche PLZ + ähnlicher Name
- Gleiche URL

**Features:**

- "Mögliche Duplikate"-Liste
- Vergleichs-Ansicht (Side-by-Side)
- Merge-Funktion (Provider zusammenführen, Audit-Trail behalten)

**Technische Komplexität:** Mittel
**Nutzen:** Mittel (wichtig bei großen Datenmengen)

---

## 🎨 7. UI/UX-Verbesserungen

### 7.1 Dark Mode ⭐

**Beschreibung:** Dunkles Farbschema für Nachtarbeit

**Implementierung:**

- Toggle im Header (Mond/Sonne-Icon)
- Speichern in LocalStorage
- Tailwind Dark-Mode-Classes

**Technische Komplexität:** Niedrig
**Nutzen:** Niedrig-Mittel (Nice-to-have)

---

### 7.2 Keyboard Shortcuts ⭐

**Beschreibung:** Power-User-Shortcuts

**Shortcuts:**

- `Strg+K`: Globale Suche öffnen
- `Strg+N`: Neuer Provider
- `Strg+B`: Batch-Scraping starten
- `Esc`: Modals schließen
- `Strg+R`: Refresh
- `?`: Shortcuts-Übersicht anzeigen

**Technische Komplexität:** Niedrig
**Nutzen:** Mittel (für Power-User sehr wertvoll)

---

### 7.3 Responsive Mobile-Optimierung ⭐⭐

**Beschreibung:** Mobile-freundliche Ansicht für Tablets/Phones

**Anpassungen:**

- Tabelle als Karten-Layout auf Mobile
- Sidebar versteckt auf Mobile (Hamburger-Menü)
- Touch-optimierte Buttons
- Swipe-Gesten (z.B. Swipe für Prüfstatus ändern)

**Technische Komplexität:** Mittel
**Nutzen:** Mittel (falls mobile Nutzung geplant)

---

### 7.4 Tabellen-Customization ⭐⭐

**Beschreibung:** User kann Spalten selbst konfigurieren

**Features:**

- Spalten ein-/ausblenden
- Spalten-Reihenfolge ändern (Drag & Drop)
- Spaltenbreite anpassen
- Einstellungen pro User speichern (LocalStorage oder DB)

**Technische Komplexität:** Mittel
**Nutzen:** Hoch (jeder User hat andere Präferenzen)

---

## 🏆 Empfohlene Priorisierung

### Phase 1: Quick Wins (Niedrige Komplexität, Hoher Nutzen)

1. ✅ **Compliance-Ampel** (Widget)
2. ✅ **Bulk-Edit-Modus** (Multi-Select + Batch-Actions)
3. ✅ **Validierungs-Dashboard** (Plausibilitätsprüfungen)
4. ✅ **Advanced Search Builder**
5. ✅ **Tabellen-Customization**

**Aufwand:** ~2-3 Wochen
**Impact:** Sehr hoch

---

### Phase 2: Kern-Features (Mittlere Komplexität, Sehr hoher Nutzen)

1. ✅ **Trend-Analyse Dashboard** (Charts)
2. ✅ **Strommix-Verteilungs-Charts**
3. ✅ **CSV/Excel-Import**
4. ✅ **Advanced Export Center**
5. ✅ **Alert-System**

**Aufwand:** ~4-6 Wochen
**Impact:** Sehr hoch

---

### Phase 3: Premium-Features (Hohe Komplexität, Mittlerer-Hoher Nutzen)

1. ✅ **Geo-Visualisierung** (Karte)
2. ✅ **Review-Workflow** (Rollen + Genehmigung)
3. ✅ **Scheduled Jobs** (Cron)
4. ✅ **Echtzeit-Scraping-Monitor** (WebSocket)
5. ✅ **Volltextsuche** in Dokumenten

**Aufwand:** ~6-8 Wochen
**Impact:** Mittel-Hoch

---

## 💡 Weitere Ideen (Brainstorming)

- **AI-Powered Anomalie-Erkennung:** ML-Modell erkennt ungewöhnliche Strommix-Werte
- **Provider-Rating-System:** Community-Bewertungen für Provider-Qualität
- **API-Endpunkte für externe Tools:** REST-API mit Swagger-Doku
- **White-Label-Modus:** Für verschiedene Behörden mit eigenem Branding
- **Multi-Tenancy:** Verschiedene Organisationen nutzen dieselbe Instanz
- **Changelog pro Provider:** Wer hat wann welches Feld geändert? (bereits via Audit-Log möglich)
- **Benchmark-Vergleich:** Provider A vs. Provider B Strommix-Vergleich

---

## 📋 Zusammenfassung

**Insgesamt 25+ Verbesserungsvorschläge** in 7 Kategorien:

- 📊 5 Reports & Analytics
- 🔍 2 Erweiterte Suchfunktionen
- ✏️ 5 Eingabemasken & Workflows
- 📈 3 Visualisierungen & Dashboards
- 🔔 2 Benachrichtigungen & Automation
- 🛠️ 2 Datenqualität & Validierung
- 🎨 4 UI/UX-Verbesserungen

**Empfehlung:** Mit **Phase 1 (Quick Wins)** starten, dann basierend auf User-Feedback Phase 2 & 3 priorisieren.

---

**Nächster Schritt:** Bitte wähle 1-3 Features aus, die am wichtigsten sind, und ich erstelle einen detaillierten Implementierungsplan! 🚀
