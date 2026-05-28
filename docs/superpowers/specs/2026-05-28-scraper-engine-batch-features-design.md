# Design-Spezifikation: Scraper-Engine Batch-Features & Live-Terminal

Dieses Dokument beschreibt die Erweiterungen der Scraper-Engine im SKZ-Cockpit, um gezielte Batch-Scrapes (für ausgewählte oder gefilterte Anbieter) direkt aus der Tabellenansicht zu starten und den Fortschritt über ein aufklappbares Echtzeit-Terminal zu überwachen.

---

## 1. Zielsetzung & Anforderungen

- **Flexible Batch-Starts:**
    - Starten eines Batch-Scrapes für alle aktuell gefilterten Anbieter.
    - Starten eines Batch-Scrapes für manuell ausgewählte Anbieter (Checkboxen).
    - Starten eines Batch-Scrapes für alle fehlerhaften/unvollständigen Anbieter der aktuellen Ansicht.
- **Visualisierung im Scraper-Tab:**
    - Statusleiste mit Fortschrittsbalken, aktuellem Provider und Abbrechen-Button direkt über der Tabelle im Tab "Scraper-Engine".
    - Aufklappbares Terminal-Fenster mit schwarzem Hintergrund und Festbreiten-Schrift, das die Live-Logs der Scrape-Jobs Zeile für Zeile darstellt und automatisch mitscrollt.

- **Backend-Erweiterung (`/api/scrape-batch`):**
    - Akzeptieren von `{ providerIds: number[] }` im POST-Body für gezieltes Abarbeiten.
    - Ausgeben der letzten 15 Jobs inklusive ihrer detaillierten `log_message` und Status im GET-Endpunkt.

---

## 2. Technische Umsetzung

### A. API-Erweiterung: [route.ts](file:///c:/Users/marti/Documents/CODE/SKZ-Scraper/src/app/api/scrape-batch/route.ts)

1. **POST-Methode:**
    - Einlesen des Request-Bodys: `const body = await request.json().catch(() => ({}));`
    - Wenn `body.providerIds` vorhanden und ein Array ist:
        - Datenbankabfrage mit Platzhaltern generieren, um diese Provider zu laden:
            ```typescript
            const placeholders = body.providerIds.map(() => '?').join(',');
            const sql = `SELECT id, name, priority FROM providers WHERE id IN (${placeholders}) ORDER BY priority DESC, id ASC`;
            const providers = await query(sql, body.providerIds);
            ```
        - Andernfalls greift das alte Verhalten mit dem `limit`-Parameter oder alle aktiven Anbieter.

2. **GET-Methode:**
    - Abfragen der letzten 15 Jobs aus der Tabelle `scrape_jobs` zusammen mit dem Provider-Namen:
        ```typescript
        const recentJobs = await query(`
            SELECT j.id, j.provider_id, p.name as provider_name, j.status, j.log_message, j.started_at, j.finished_at
            FROM scrape_jobs j
            JOIN providers p ON j.provider_id = p.id
            ORDER BY j.id DESC LIMIT 15
        `);
        ```
    - Die API gibt nun `{ isRunning, current, total, currentProvider, recentJobs }` zurück.

---

### B. Frontend-Erweiterung: [DashboardClient.tsx](file:///c:/Users/marti/Documents/CODE/SKZ-Scraper/src/components/DashboardClient.tsx)

1. **State-Erweiterungen:**
    - `const [showTerminal, setShowTerminal] = useState(false);`
    - `const [batchJobs, setBatchJobs] = useState<any[]>([]);`

2. **API-Polling anpassen:**
    - Im `useEffect` für das Batch-Polling wird `setBatchJobs(data.recentJobs || [])` aufgerufen.
    - Da das Polling alle 2 Sekunden läuft, aktualisiert sich das Terminal automatisch in Echtzeit.

3. **`handleBatchScrape` anpassen:**
    - Signatur: `const handleBatchScrape = async (options?: { limit?: number; providerIds?: number[] })`
    - Wenn `options?.providerIds` übergeben wird, sendet der POST-Request diese im Body:
        ```typescript
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: options.providerIds ? JSON.stringify({ providerIds: options.providerIds }) : undefined,
        });
        ```

4. **Rendering der Aktionsleiste (Scraper-Tab):**
    - Einbindung über der Tabelle.
    - Wenn `selectedProviderIds.length > 0`:
        - Button: _"Ausgewählte scrapen ({selectedProviderIds.length})"_
        - Button: _"Auswahl aufheben"_
    - Wenn `selectedProviderIds.length === 0`:
        - Button: _"Gefilterte scrapen ({filteredProviders.length})"_
        - Button: _"Fehlgeschlagene/Nie gescrapte der aktuellen Ansicht scrapen ({count})"_ (filtert `filteredProviders` nach `latest_job_status !== 'success'`).

5. **Rendering des Terminals:**
    - Ein stilisierter Kasten unter dem Ladebalken:
        ```tsx
        <div className="bg-slate-900 text-slate-100 p-4 rounded-lg font-mono text-xs h-60 overflow-y-auto mt-2">
            {/* Live logs go here */}
        </div>
        ```
    - Scroll-Ref (`useRef<HTMLDivElement>(null)`) verwenden, um bei Änderungen von `batchJobs` automatisch ganz nach unten zu scrollen (`element.scrollTop = element.scrollHeight`).

---

## 3. Verifizierungsplan

- **Funktionale Abnahme:**
    1. Einzelne Anbieter markieren und den Batch-Scrape nur für die Auswahl starten.
    2. Filter anwenden (z.B. Stadt "Leipzig") und den Batch-Scrape für alle gefilterten Anbieter starten.
    3. Terminal aufklappen und prüfen, ob die Logs der Scrapes in Echtzeit geladen und aktualisiert werden.
    4. Auf "Stoppen" klicken und prüfen, ob der Batch gestoppt wird und das Terminal den Abbruch anzeigt.
    5. Prüfen, ob das Terminal nach dem Schließen seinen State beibehält.

- **Qualitätskontrolle:**
    - `npm run format` ausführen.
    - `npm run lint` ausführen.
    - `npm run test` ausführen.
