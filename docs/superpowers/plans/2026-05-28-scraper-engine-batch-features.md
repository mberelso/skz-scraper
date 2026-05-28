# Scraper-Engine Batch-Features & Live-Terminal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement flexible batch-scraping options (selected, filtered, failed) in the Scraper-Engine tab, with a live progress bar and an expandable terminal displaying real-time scrap logs.

**Architecture:**

- Extend the `/api/scrape-batch` POST route to accept a list of provider IDs in the request body.
- Extend the `/api/scrape-batch` GET route to return the 15 most recent scraping jobs with their status and log messages.
- Add UI state for terminal display, terminal auto-scrolling, and batch job logging in `DashboardClient.tsx`.
- Create a dynamic action bar above the provider table to trigger targeted batch-scrapes.
- Render the progress bar and terminal logs directly in the Scraper-Engine tab when a batch is active.

**Tech Stack:** Next.js, React, PostgreSQL (Neon), TailwindCSS.

---

### Task 1: Extend Batch Scrape API Routes

**Files:**

- Modify: `src/app/api/scrape-batch/route.ts`

- [ ] **Step 1: Read JSON body in POST and filter by provider IDs**
      Update the `POST` method to support selective scraping of specific provider IDs passed in the body.

    Code replacement for `POST`:

    ```typescript
    export async function POST(request: Request) {
        try {
            // Rate limit: max 5 batch starts per minute
            const rl = checkRateLimit('batch-post', 5, 60_000);
            if (!rl.success) {
                return NextResponse.json(
                    { error: `Zu viele Anfragen. Bitte ${rl.retryAfter}s warten.` },
                    { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
                );
            }

            // Check if already running
            const status = await getBatchStatus();
            if (status.isRunning) {
                return NextResponse.json({ error: 'Batch läuft bereits' }, { status: 409 });
            }

            const body = await request.json().catch(() => ({}));
            const providerIds = body.providerIds;

            const { searchParams } = new URL(request.url);
            const limitParam = searchParams.get('limit');
            const limit = limitParam ? parseInt(limitParam, 10) : undefined;

            let providers: any[] = [];

            if (Array.isArray(providerIds) && providerIds.length > 0) {
                // Fetch only specified providers, preserving priority ordering
                const placeholders = providerIds.map(() => '?').join(',');
                const sql = `
                    SELECT id, name, priority 
                    FROM providers 
                    WHERE id IN (${placeholders})
                    ORDER BY priority DESC, id ASC
                `;
                providers = await query(sql, providerIds);
            } else if (limit) {
                const sql = `
                    SELECT p.id, p.name, p.priority
                    FROM providers p
                    LEFT JOIN (
                        SELECT provider_id, MAX(id) as latest_job_id
                        FROM scrape_jobs
                        GROUP BY provider_id
                    ) latest ON p.id = latest.provider_id
                    LEFT JOIN scrape_jobs j ON latest.latest_job_id = j.id
                    WHERE p.active = TRUE
                    AND (j.status IS NULL OR j.status != 'success')
                    ORDER BY p.priority DESC, p.id ASC
                    LIMIT ${limit}
                `;
                providers = await query(sql);
            } else {
                const sql = 'SELECT id, name FROM providers WHERE active = TRUE ORDER BY priority DESC, id ASC';
                providers = await query(sql);
            }

            if (providers.length === 0) {
                return NextResponse.json({ error: 'Keine aktiven Provider gefunden' }, { status: 400 });
            }

            // Cleanup stuck jobs before starting
            await query(
                `UPDATE scrape_jobs SET status = 'failed', log_message = CONCAT(COALESCE(log_message,''), ' | Abgebrochen (Batch-Start)'), finished_at = NOW() WHERE status = 'running'`
            );

            // Initialize batch status in DB
            await updateBatchStatus(true, 0, providers.length, null);

            // Fire and forget
            processBatchInBackground(providers).catch(async (err) => {
                console.error('[BATCH] Background processing failed:', err.message);
                await updateBatchStatus(false, 0, 0, null).catch(() => {});
            });

            return NextResponse.json({
                success: true,
                message: `Batch-Scrape gestartet für ${providers.length} Provider. Jobs laufen sequenziell im Hintergrund.`,
                providerCount: providers.length,
            });
        } catch (error: any) {
            console.error('[BATCH] API Error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
    }
    ```

- [ ] **Step 2: Append recent jobs and logs in GET**
      Update the `GET` method to fetch the last 15 scrape jobs.

    Code replacement for `GET`:

    ```typescript
    export async function GET(_request: Request) {
        try {
            const status = await getBatchStatus();
            const recentJobs = await query(`
                SELECT j.id, j.provider_id, p.name as provider_name, j.status, j.log_message, j.started_at, j.finished_at
                FROM scrape_jobs j
                JOIN providers p ON j.provider_id = p.id
                ORDER BY j.id DESC LIMIT 15
            `);
            return NextResponse.json({
                ...status,
                recentJobs: JSON.parse(
                    JSON.stringify(recentJobs, (_key, value) => (typeof value === 'bigint' ? Number(value) : value))
                ),
            });
        } catch (error: any) {
            return NextResponse.json({ isRunning: false, current: 0, total: 0, currentProvider: null, recentJobs: [] });
        }
    }
    ```

- [ ] **Step 3: Commit Task 1**
      Run:
    ```bash
    git add src/app/api/scrape-batch/route.ts
    git commit -m "feat: extend batch scraping api with selective scraping and recent job status logs"
    ```

---

### Task 2: Implement UI States and Action Bar in Frontend

**Files:**

- Modify: `src/components/DashboardClient.tsx`

- [ ] **Step 1: Declare state variables and update API Polling**
      Add terminal state, batch jobs logs state, terminal end ref, and scroll-to-bottom effect. Update poll callbacks to store logs.

    Add code imports and states (around line 30+):

    ```typescript
    const [showTerminal, setShowTerminal] = useState(false);
    const [batchJobs, setBatchJobs] = useState<any[]>([]);
    const terminalEndRef = useRef<HTMLDivElement>(null);

    // Auto scroll terminal
    useEffect(() => {
        if (showTerminal && terminalEndRef.current) {
            terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [batchJobs, showTerminal]);
    ```

    Update the `pollBatchStatus` and `useEffect` onload endpoints in `DashboardClient.tsx` to read `data.recentJobs` and update `setBatchJobs(data.recentJobs || [])`.

- [ ] **Step 2: Update handleBatchScrape signature**
      Modify `handleBatchScrape` to accept `options?: { limit?: number; providerIds?: number[] }` and attach the request body payload.

    Code change to make:

    ```typescript
    const handleBatchScrape = async (options?: { limit?: number; providerIds?: number[] }) => {
        const limit = options?.limit;
        const providerIds = options?.providerIds;
        const count = providerIds ? providerIds.length : limit || totalProviders;

        if (!confirm(`Batch-Scrape für ${count} Provider starten? Dies kann einige Minuten dauern.`)) {
            return;
        }

        setBatchLoading(true);
        setBatchResult(null);

        try {
            const url = limit ? `/api/scrape-batch?limit=${limit}` : '/api/scrape-batch';
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: providerIds ? JSON.stringify({ providerIds }) : undefined,
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error);

            setBatchResult({ success: true, message: data.message });
            setBatchActive(true);
            setTimeout(() => refreshData(), 3000);
        } catch (err: any) {
            setBatchResult({ success: false, message: err.message });
        } finally {
            setBatchLoading(false);
        }
    };
    ```

- [ ] **Step 3: Commit Task 2**
      Run:
    ```bash
    git add src/components/DashboardClient.tsx
    git commit -m "feat: add frontend states and configure handleBatchScrape for provider selective batching"
    ```

---

### Task 3: Render Dynamic Action Bar and Terminal UI

**Files:**

- Modify: `src/components/DashboardClient.tsx`

- [ ] **Step 1: Insert Action Bar and Live Monitor Panel in Scraper Tab**
      Locate the scraper rendering block (right after filter bar container, around line ~830 in `scraper` tab) and insert:
    1. The Dynamic Action Bar (allowing selective batching of checkboxed or filtered items).
    2. The Progress Bar, stop button, terminal toggle button, and expandable terminal window (only rendered when `batchStatus?.isRunning` is active).

- [ ] **Step 2: Commit Task 3**
      Run:
    ```bash
    git add src/components/DashboardClient.tsx
    git commit -m "feat: render dynamic action bar, progress status and logs terminal in scraper tab"
    ```

---

### Task 4: Quality Assurance & Code Validation

**Files:**

- None (verification commands)

- [ ] **Step 1: Format and Lint**
      Run:

    ```bash
    npm run format
    npm run lint
    ```

    Expected: Clear and compliant code without any validation errors.

- [ ] **Step 2: Run Tests**
      Run:
    ```bash
    npm run test
    ```
    Expected: All existing test suites pass.
