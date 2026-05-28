# Dashboard Navigation Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Dashboard's Live-Monitor jobs and the "Behördlicher Arbeitsablauf" steps interactive and clickable, enhancing the cockpit's navigation.

**Architecture:**

- In `DashboardClient.tsx`, look up the matching provider from the `providers` list using the `job.provider_id` in the Live-Monitor, and trigger `setSelectedProvider(provider)`.
- Wire up the three guide boxes in the workflow guide section to call `setActiveTab(...)` with their respective target tab names.
- Update styling to add CSS hover transformations, transition-all, border colors, and `cursor-pointer`.

**Tech Stack:** Next.js (App Router), React, TailwindCSS, TypeScript.

---

### Task 1: Make Live-Monitor Jobs Clickable to Open ProviderModal

**Files:**

- Modify: `src/components/DashboardClient.tsx:656-696`

- [ ] **Step 1: Implement the clickable jobs**
      Replace the rendering of the `recentJobs` list to look up the provider and trigger `setSelectedProvider` on click.

    Code change to make:

    ```tsx
    {
        recentJobs.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">Keine Jobs in der Warteschlange</p>
        ) : (
            recentJobs.slice(0, 5).map((job: any) => {
                const provider = providers.find((p: any) => p.id === job.provider_id);
                return (
                    <div
                        key={job.id}
                        onClick={() => provider && setSelectedProvider(provider)}
                        className={`flex items-center justify-between p-3 rounded-lg border transition-all duration-150 ${
                            provider
                                ? 'cursor-pointer hover:bg-slate-100 hover:border-slate-300 bg-slate-50 border-slate-100'
                                : 'bg-slate-50 border-slate-100'
                        }`}
                        title={provider ? `${provider.name} Details öffnen` : undefined}
                    >
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-slate-900 truncate">{job.provider_name}</div>
                            <div className="text-xs text-slate-400" suppressHydrationWarning>
                                {formatJobDate(job.started_at)}
                            </div>
                        </div>
                        <div className="ml-3">
                            {job.status === 'running' && (
                                <span className="px-2 py-1 text-xs font-bold rounded-full bg-blue-100 text-blue-700">
                                    Laufend
                                </span>
                            )}
                            {job.status === 'success' && (
                                <span className="px-2 py-1 text-xs font-bold rounded-full bg-green-100 text-green-700">
                                    Erfolg
                                </span>
                            )}
                            {job.status === 'failed' && (
                                <span className="px-2 py-1 text-xs font-bold rounded-full bg-red-100 text-red-700">
                                    Fehler
                                </span>
                            )}
                            {job.status === 'partial' && (
                                <span className="px-2 py-1 text-xs font-bold rounded-full bg-yellow-100 text-yellow-700">
                                    Teilweise
                                </span>
                            )}
                        </div>
                    </div>
                );
            })
        );
    }
    ```

- [ ] **Step 2: Commit Task 1**
      Run:
    ```bash
    git add src/components/DashboardClient.tsx
    git commit -m "feat: make live-monitor jobs clickable to open provider details modal"
    ```

---

### Task 2: Make Behördlicher Arbeitsablauf Steps Clickable to Switch Tabs

**Files:**

- Modify: `src/components/DashboardClient.tsx:708-741`

- [ ] **Step 1: Wire up the workflow boxes**
      Add `onClick` listeners calling `setActiveTab` and Tailwind classes for cursor, transitions, and hover states.

    Code change to make:

    ```tsx
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div
            onClick={() => setActiveTab('scraper')}
            className="bg-slate-50 p-5 rounded-lg border border-slate-200 space-y-2 cursor-pointer hover:shadow-md hover:border-orange-300 hover:-translate-y-0.5 transition-all duration-200"
        >
            <div className="text-xs font-bold text-[#d5781a] uppercase tracking-wider">Schritt 1</div>
            <h4 className="font-bold text-slate-900 text-sm">Automatisierter Scrape (Scraper-Engine)</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
                Suchen und Extrahieren Sie die Stromkennzeichnungen der Energieversorger direkt von deren Webseiten.
            </p>
        </div>
        <div
            onClick={() => setActiveTab('matching')}
            className="bg-slate-50 p-5 rounded-lg border border-slate-200 space-y-2 cursor-pointer hover:shadow-md hover:border-indigo-300 hover:-translate-y-0.5 transition-all duration-200"
        >
            <div className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Schritt 2</div>
            <h4 className="font-bold text-slate-900 text-sm">Datenmatching & CSV-Import</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
                Importieren Sie die HKN-UBA-Entwertungen und tragen Sie die gelieferten Strommengen ein (Einheit 1).
            </p>
        </div>
        <div
            onClick={() => setActiveTab('compliance')}
            className="bg-slate-50 p-5 rounded-lg border border-slate-200 space-y-2 cursor-pointer hover:shadow-md hover:border-green-300 hover:-translate-y-0.5 transition-all duration-200"
        >
            <div className="text-xs font-bold text-green-600 uppercase tracking-wider">Schritt 3</div>
            <h4 className="font-bold text-slate-900 text-sm">Compliance & Auditierung</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
                Vergleichen Sie Soll und Ist. Vergeben Sie Prüfvermerke und setzen Sie den finalen Status (Einheit 2).
            </p>
        </div>
    </div>
    ```

- [ ] **Step 2: Commit Task 2**
      Run:
    ```bash
    git add src/components/DashboardClient.tsx
    git commit -m "feat: make workflow boxes clickable to switch between navigation tabs"
    ```

---

### Task 3: Quality Assurance & Code Validation

**Files:**

- None (verification commands)

- [ ] **Step 1: Format and Lint**
      Run:

    ```bash
    npm run format
    npm run lint
    ```

    Expected: Clean build without code style or JSX validation errors.

- [ ] **Step 2: Run Tests**
      Run:
    ```bash
    npm run test
    ```
    Expected: All existing test suites pass.
