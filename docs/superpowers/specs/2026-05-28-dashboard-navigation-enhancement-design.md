# Design-Spezifikation: Dashboard Navigation-Erweiterung

Dieses Dokument beschreibt die funktionalen und visuellen Anpassungen des Dashboards, um die Navigation zwischen dem Live-Monitor, dem behördlichen Arbeitsablauf und den detaillierten Ansichten (Anbieter-Modal, Scraper, Datenmatching, Compliance) zu verbessern.

---

## 1. Zielsetzung & Anforderungen

- **Live-Monitor:**
    - Die Einträge der Scrape-Jobs im Live-Monitor sollen klickbar sein.
    - Ein Klick auf einen Job-Eintrag soll direkt das zugehörige `ProviderModal` für den entsprechenden Energieversorger öffnen, ohne den aktuellen Tab ("Dashboard") zu wechseln oder neu laden zu müssen.
    - Visuelles Feedback bei Hover (Mauszeiger wird zum Pointer, leichte Hintergrundänderung).

- **Behördlicher Arbeitsablauf nach § 42 EnWG:**
    - Die drei Boxen, die die Schritte des Workflows erklären, sollen direkt als Navigations-Links zu den jeweiligen Tabs fungieren:
        - **Schritt 1 (Automatisierter Scrape)** -> Wechselt zum Tab **Scraper-Engine** (`scraper`).
        - **Schritt 2 (Datenmatching & CSV-Import)** -> Wechselt zum Tab **Datenmatching** (`matching`).
        - **Schritt 3 (Compliance & Auditierung)** -> Wechselt zum Tab **Compliance & Audit** (`compliance`).
    - Visuelles Feedback bei Hover (Schattenwurf, feine Verschiebung nach oben und passende Randfarbe).

---

## 2. Technische Umsetzung

Die Änderungen betreffen ausschließlich die Client-Komponente [DashboardClient.tsx](file:///c:/Users/marti/Documents/CODE/SKZ-Scraper/src/components/DashboardClient.tsx).

### A. Live-Monitor Anpassung

Im JSX-Bereich des Live-Monitors (Zeilen ~656-696) wird die Job-Zeile angepasst:

1. Suchen des Providers: `const provider = providers.find((p: any) => p.id === job.provider_id);`
2. Klick-Handler hinzufügen: `onClick={() => provider && setSelectedProvider(provider)}`
3. Styling-Klassen hinzufügen: `cursor-pointer hover:bg-slate-100 hover:border-slate-300 transition-all duration-150` (falls `provider` vorhanden ist).

### B. Behördlicher Arbeitsablauf Anpassung

Im JSX-Bereich des Guides (Zeilen ~708-741) werden die drei Boxen in Buttons bzw. klickbare Divs umgewandelt:

1. Box 1 (Schritt 1):
    - Klick-Handler: `onClick={() => setActiveTab('scraper')}`
    - Klassen: `cursor-pointer hover:shadow-md hover:border-orange-300 hover:-translate-y-0.5 transition-all duration-200`
2. Box 2 (Schritt 2):
    - Klick-Handler: `onClick={() => setActiveTab('matching')}`
    - Klassen: `cursor-pointer hover:shadow-md hover:border-indigo-300 hover:-translate-y-0.5 transition-all duration-200`
3. Box 3 (Schritt 3):
    - Klick-Handler: `onClick={() => setActiveTab('compliance')}`
    - Klassen: `cursor-pointer hover:shadow-md hover:border-green-300 hover:-translate-y-0.5 transition-all duration-200`

---

## 3. Verifizierungsplan

- **Manuelle Prüfung im Browser:**
    1. Das Dashboard aufrufen.
    2. Im "Live-Monitor" auf einen Scrape-Job klicken. Prüfen, ob sich das `ProviderModal` für den entsprechenden Anbieter öffnet.
    3. Prüfen, ob das Modal nach dem Schließen wieder das Dashboard anzeigt.
    4. Im Bereich "Behördlicher Arbeitsablauf" nacheinander auf Schritt 1, Schritt 2 und Schritt 3 klicken.
    5. Prüfen, ob sich der Tab entsprechend zu "Scraper-Engine", "Datenmatching" und "Compliance & Audit" umschaltet.
    6. Prüfen der Hover-Effekte auf allen Elementen.

- **Automatisierte Qualitätskontrolle:**
    - `npm run format` ausführen.
    - `npm run lint` ausführen (insbesondere auf JSX/TSX Validität achten).
    - `npm run test` ausführen, um sicherzustellen, dass keine Tests fehlschlagen.
