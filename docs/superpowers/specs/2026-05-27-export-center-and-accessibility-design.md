# Spezifikation: Erweitertes Export-Center & Barrierefreie Modale

Dieses Dokument beschreibt das technische Design und die Anforderungen für die Implementierung eines erweiterten Export-Centers (PDF-Berichte und erweiterter CSV-Export) sowie die Verbesserung der Barrierefreiheit (Accessibility) aller Modale im SKZ-Cockpit.

---

## 🎯 1. Ziele & Anwendungsfälle

### Erweitertes Export-Center
* **Zweck:** Behördenvertreter müssen in der Lage sein, strukturierte Daten (CSV) und behördenkonforme Berichte (PDF) für bestimmte Teilmengen von Energieversorgern zu generieren.
* **Manuelle Auswahl:** Export bestimmter Provider, die entweder in der Tabelle per Checkbox ausgewählt oder im Export-Center namentlich gesucht wurden.
* **Filter-Auswahl:** Export basierend auf Kriterien wie Berichtsjahr, Prüfstatus oder Region.
* **PDF-Vollbericht:** Enthält ein Deckblatt, eine Management-Zusammenfassung mit aggregierten Statistiken (z. B. durchschnittlicher EE-Anteil), eine Übersichtstabelle und detaillierte Einzelblätter pro Provider (inkl. Verlauf, Audit-Trail und Notizen).

### Barrierefreie Modale
* **Zweck:** Tastatur- und Screenreader-Bedienung der Modale im Cockpit verbessern, um grundlegenden Barrierefreiheitsstandards (UX-Best-Practices) zu entsprechen.
* **Aktionen:** Schließen per `Esc`, Einsperren des Tastaturfokus im geöffneten Modal (Focus-Trap), Zurücksetzen des Fokus nach dem Schließen.

---

## 🛠️ 2. Technische Architektur & API-Design

### 2.1 PDF-Generierung via Puppeteer (Backend)
Da Puppeteer bereits im Projekt für das Scraping installiert ist, nutzen wir die integrierte PDF-Druckfunktion (`page.pdf()`). Dies spart zusätzliche Bibliotheken und gibt uns volle CSS-Kontrolle über das Layout des Berichts.

* **Ablauf:**
  1. Die API-Route stellt die benötigten Daten (Stammdaten, Strommix, Audit-Logs, Notizen) der ausgewählten Provider zusammen.
  2. Ein HTML-Template wird mit den Daten befüllt (inkl. SVG/Inline-CSS für Diagramme und Tabellen).
  3. Puppeteer öffnet eine Headless-Browserinstanz, lädt das HTML und erzeugt ein PDF im A4-Format.
  4. Das PDF wird als Stream direkt an den Client zurückgegeben.

### 2.2 API-Endpunkte

#### `POST /api/export/pdf`
Generiert den PDF-Vollbericht.
* **Request-Body:**
  ```json
  {
    "mode": "filter" | "manual",
    "providerIds": [1, 2, 3], // Nur bei mode: "manual"
    "filters": { // Nur bei mode: "filter"
      "year": 2024,
      "reviewStatus": "geprueft" | "offen" | "beanstandet" | "all",
      "city": string
    }
  }
  ```
* **Response:** Binary PDF-Datenstrom (`Content-Type: application/pdf`).

#### `POST /api/export/csv`
Exportiert die gefilterten oder ausgewählten Provider als CSV.
* **Request-Body:** (Gleiche Struktur wie PDF-Export)
* **Response:** Text/CSV-Datenstrom (`Content-Type: text/csv`).

---

## 🎨 3. UI-Komponenten (Frontend)

### 3.1 Checkboxen in der Tabelle (`DashboardClient.tsx`)
* Hinzufügen einer Spalte ganz links in der Provider-Tabelle.
* Header-Checkbox zum Auswählen/Abwählen aller sichtbaren Zeilen.
* State im Client, um die IDs der ausgewählten Provider zu verwalten (`selectedProviderIds: number[]`).

### 3.2 Export-Center-Modal (`ExportCenterModal.tsx`)
* **Umschalter Export-Modus:** Radio-Buttons oder Button-Gruppe:
  * *Nach Filter:* Zeigt Dropdowns für Berichtsjahr, Prüfstatus und Region.
  * *Manuelle Auswahl:* Zeigt ein Suchfeld. Bei Eingabe wird eine Ergebnisliste eingeblendet. Klick auf einen Eintrag fügt diesen zur Liste hinzu. Die Liste zeigt alle ausgewählten Provider mit einem "Entfernen"-Button.
* **Vorschau-Panel (Rechts):**
  * Zeigt die Anzahl der Provider an, die aktuell exportiert werden.
  * Zeigt Dateiformat-Wahl (PDF vs. CSV).
  * Großer Button: "Export starten" (mit Ladeindikator).

---

## ♿ 4. Barrierefreiheit (Modal-Accessibility)

Betrifft `ExportCenterModal.tsx`, `ProviderModal.tsx` und `CreateProviderModal.tsx`.

1. **Tastatur-Schließen (`Esc`):**
   * Registrieren eines globalen `keydown`-Event-Listeners im Modal-Component.
   * Bei `event.key === 'Escape'` wird die `onClose`-Prop aufgerufen.
2. **Focus-Trap (Fokus-Falle):**
   * Nutzen einer `useEffect`-Schleife, die die fokussierbaren Elemente im Modal ermittelt.
   * Abfangen des `Tab`-Tastendrucks: Wenn das letzte Element fokussiert ist und `Tab` gedrückt wird, springt der Fokus auf das erste Element. Wenn das erste Element fokussiert ist und `Shift+Tab` gedrückt wird, springt er auf das letzte.
3. **Fokus-Rückgabe:**
   * Speichern des aktiven Elements (`document.activeElement`) beim Öffnen.
   * Nach dem Schließen (im Cleanup des Modals) wird der Fokus wieder auf dieses Element zurückgesetzt.

---

## 🧪 5. Verifikationsplan

### Automatisierte Tests
* Unittests für die API-Payload-Validierung schreiben (Zod-Schemas für die Export-Requests).
* Validierung der PDF-Erzeugung (Prüfen, ob der Buffer eine gültige PDF-Signatur `%PDF-` enthält).

### Manuelle Tests
1. **Export-Ablauf:**
   * Mehrere Checkboxen in der Tabelle anklicken und auf „Export-Center“ klicken. Prüfen, ob die Provider im manuellen Modus gelistet sind.
   * PDF generieren und Layout im PDF-Reader prüfen (Deckblatt, Tabellenstruktur, Zeilenumbrüche).
   * CSV-Export testen und in Excel importieren (Prüfung auf UTF-8 Codierung und Semikolon-Trennzeichen).
2. **Accessibility:**
   * Modal öffnen und versuchen, per `Tab` auf Elemente hinter dem Modal zuzugreifen. Dies darf nicht möglich sein.
   * `Esc`-Taste drücken und prüfen, ob das Modal schließt und der Fokus auf den richtigen Button zurückspringt.
