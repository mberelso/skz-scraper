'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import ProviderModal from './ProviderModal';
import CreateProviderModal from './CreateProviderModal';

const formatJobDate = (dateVal: any) => {
    if (!dateVal) return '-';
    let val = dateVal;
    if (typeof dateVal === 'string') {
        val = dateVal.replace(' ', 'T');
    }
    const d = new Date(val);
    return isNaN(d.getTime()) ? '-' : d.toLocaleString('de-DE');
};

export default function DashboardClient({
    providers,
    recentJobs,
    mixFoundCount,
    successCount,
    totalProviders,
    error,
}: any) {
    const router = useRouter();
    const [selectedProvider, setSelectedProvider] = useState<any>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [batchLoading, setBatchLoading] = useState(false);
    const [batchResult, setBatchResult] = useState<any>(null);
    const [batchStatus, setBatchStatus] = useState<any>(null);
    const [batchActive, setBatchActive] = useState(false);
    const [sortColumn, setSortColumn] = useState<string>('id');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const [editingFileNumber, setEditingFileNumber] = useState<number | null>(null);
    const [fileNumberValue, setFileNumberValue] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [dataFilter, setDataFilter] = useState<string>('all');
    const [reviewFilter, setReviewFilter] = useState<string>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [livePollingEnabled, setLivePollingEnabled] = useState(true);
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const batchPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const refreshCounterRef = useRef<number>(0);

    const hasRunningJob = recentJobs.some((j: any) => j.status === 'running');

    // Live-polling: refresh every 4s if enabled
    useEffect(() => {
        if (!livePollingEnabled) {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
            return;
        }

        pollingRef.current = setInterval(() => {
            router.refresh();
        }, 4000);

        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, [livePollingEnabled, router]);

    // Batch status polling
    useEffect(() => {
        if (!batchActive) {
            if (batchPollingRef.current) {
                clearInterval(batchPollingRef.current);
                batchPollingRef.current = null;
            }
            return;
        }

        refreshCounterRef.current = 0;

        const pollBatchStatus = async () => {
            try {
                const res = await fetch('/api/scrape-batch');
                const data = await res.json();
                setBatchStatus(data);

                refreshCounterRef.current++;
                if (data.isRunning && refreshCounterRef.current >= 3) {
                    router.refresh();
                    refreshCounterRef.current = 0;
                }

                if (!data.isRunning) {
                    setBatchActive(false);
                    router.refresh();
                }
            } catch {
                // Silently fail
            }
        };

        pollBatchStatus();
        batchPollingRef.current = setInterval(pollBatchStatus, 2000);

        return () => {
            if (batchPollingRef.current) clearInterval(batchPollingRef.current);
        };
    }, [batchActive, router]);

    useEffect(() => {
        fetch('/api/scrape-batch')
            .then((r) => r.json())
            .then((data) => {
                if (data.isRunning) setBatchActive(true);
                setBatchStatus(data);
            })
            .catch(() => {});
    }, []);

    const refreshData = () => router.refresh();

    const handleSort = (column: string) => {
        if (sortColumn === column) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection('asc');
        }
    };

    const handleReviewStatus = async (providerId: number, newStatus: string) => {
        try {
            const res = await fetch(`/api/providers/${providerId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ review_status: newStatus }),
            });
            if (!res.ok) throw new Error('Fehler beim Speichern');
            router.refresh();
        } catch (err: any) {
            alert('Fehler: ' + err.message);
        }
    };

    // Filter pipeline
    const filteredProviders = providers.filter((p: any) => {
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const matches =
                (p.name || '').toLowerCase().includes(q) ||
                (p.city || '').toLowerCase().includes(q) ||
                (p.zip || '').toString().includes(q) ||
                (p.file_number || '').toLowerCase().includes(q);
            if (!matches) return false;
        }
        if (statusFilter !== 'all') {
            if (statusFilter === 'never' && p.latest_job_status) return false;
            if (statusFilter !== 'never' && p.latest_job_status !== statusFilter) return false;
        }
        if (dataFilter === 'with_data' && !p.last_mix_year) return false;
        if (dataFilter === 'no_data' && p.last_mix_year) return false;
        if (dataFilter === 'low_confidence' && (p.last_confidence === null || p.last_confidence >= 40)) return false;
        if (reviewFilter !== 'all' && (p.review_status || 'offen') !== reviewFilter) return false;
        return true;
    });

    const sortedProviders = [...filteredProviders].sort((a: any, b: any) => {
        let aVal = a[sortColumn];
        let bVal = b[sortColumn];

        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;

        if (sortColumn === 'last_renewable_percentage') {
            aVal = aVal ?? -1;
            bVal = bVal ?? -1;
        }

        if (typeof aVal === 'string' && typeof bVal === 'string') {
            return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        } else {
            return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }
    });

    const totalPages = Math.max(1, Math.ceil(sortedProviders.length / pageSize));
    const paginatedProviders = sortedProviders.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, statusFilter, dataFilter, reviewFilter]);

    const handleFileNumberEdit = async (providerId: number, newFileNumber: string) => {
        try {
            const res = await fetch(`/api/providers/${providerId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_number: newFileNumber.trim() || null }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to update file number');
            }

            setEditingFileNumber(null);
            setFileNumberValue('');
            router.refresh();
        } catch (err: any) {
            alert(`Fehler beim Speichern:\n\n${err.message}`);
        }
    };

    const startEditingFileNumber = (providerId: number, currentValue: string | null) => {
        setEditingFileNumber(providerId);
        setFileNumberValue(currentValue || '');
    };

    const cancelEditingFileNumber = () => {
        setEditingFileNumber(null);
        setFileNumberValue('');
    };

    const handleBatchScrape = async (limit?: number) => {
        const count = limit || totalProviders;
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

    const handleStopBatch = async () => {
        try {
            const res = await fetch('/api/scrape-batch', {
                method: 'DELETE',
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error);

            setBatchResult({ success: true, message: data.message });
            setBatchStatus({ isRunning: false, current: 0, total: 0, currentProvider: null });
            setBatchActive(false);
            setBatchLoading(false);
            setTimeout(() => refreshData(), 1000);
        } catch (err: any) {
            setBatchResult({ success: false, message: err.message });
        }
    };

    return (
        <div className="flex h-screen overflow-hidden">
            {/* Sidebar Navigation */}
            <aside className="w-64 flex-shrink-0 bg-white border-r border-slate-200 hidden md:flex flex-col">
                <div className="p-6 flex items-center gap-3">
                    <div className="text-primary">
                        <span className="material-symbols-outlined text-4xl">bolt</span>
                    </div>
                    <h1 className="text-xl font-bold tracking-tight text-slate-900 uppercase">SKZ-Cockpit</h1>
                </div>
                <nav className="flex-1 px-4 space-y-1 mt-4">
                    <div className="sidebar-active flex items-center gap-3 px-3 py-3 text-sm font-semibold rounded-r-lg">
                        <span className="material-symbols-outlined">dashboard</span>
                        Dashboard
                    </div>
                </nav>
                <div className="p-4 border-t border-slate-200">
                    <button
                        onClick={async () => {
                            await fetch('/api/auth/logout', { method: 'POST' });
                            window.location.href = '/login';
                        }}
                        className="flex items-center gap-3 p-2 w-full text-sm text-slate-600 hover:text-primary transition-colors"
                    >
                        <span className="material-symbols-outlined">logout</span>
                        Abmelden
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Header */}
                <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 z-10">
                    <div className="flex items-center gap-4 flex-1">
                        <div className="relative w-full max-w-md">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                                search
                            </span>
                            <input
                                className="w-full pl-10 pr-4 py-2 rounded-lg bg-slate-100 border-none focus:ring-2 focus:ring-primary/50 text-sm"
                                placeholder="Suche nach Name, Stadt, PLZ..."
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setLivePollingEnabled(!livePollingEnabled)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border transition-all ${
                                livePollingEnabled
                                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                                    : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200'
                            }`}
                            title={
                                livePollingEnabled
                                    ? 'Automatisches Laden deaktivieren'
                                    : 'Automatisches Laden aktivieren'
                            }
                        >
                            <span className="relative flex h-3 w-3">
                                {livePollingEnabled && (
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                )}
                                <span
                                    className={`relative inline-flex rounded-full h-3 w-3 ${livePollingEnabled ? 'bg-indigo-500' : 'bg-slate-400'}`}
                                ></span>
                            </span>
                            <span>Live-Update: {livePollingEnabled ? 'Aktiv' : 'Inaktiv'}</span>
                        </button>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all shadow-sm"
                        >
                            <span className="material-symbols-outlined text-sm">add</span>
                            Neuer Provider
                        </button>
                        <a
                            href={`/api/export/csv?search=${encodeURIComponent(searchQuery)}&status=${statusFilter}&data=${dataFilter}&review=${reviewFilter}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all shadow-sm"
                        >
                            <span className="material-symbols-outlined text-sm">download</span>
                            CSV Export
                        </a>
                    </div>
                </header>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-8 space-y-8">
                    {error && (
                        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
                            <span className="material-symbols-outlined">error</span>
                            <div>
                                <strong className="font-bold">System Error: </strong>
                                <span className="block sm:inline">{error}</span>
                            </div>
                        </div>
                    )}

                    {/* Page Title */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Stromkennzeichnungs-Dashboard</h2>
                            <p className="text-slate-500">Überwachung deutscher Energieversorger nach § 42 EnWG</p>
                        </div>
                    </div>

                    {/* Metric Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <div className="p-2 bg-primary/10 rounded-lg">
                                    <span className="material-symbols-outlined text-primary">business</span>
                                </div>
                            </div>
                            <p className="text-slate-500 text-sm font-medium">Anbieter gesamt</p>
                            <h3 className="text-2xl font-bold mt-1">{totalProviders}</h3>
                        </div>
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <div className="p-2 bg-primary/10 rounded-lg">
                                    <span className="material-symbols-outlined text-primary">check_circle</span>
                                </div>
                                <span className="text-green-600 text-xs font-bold bg-green-50 px-2 py-1 rounded">
                                    Aktiv
                                </span>
                            </div>
                            <p className="text-slate-500 text-sm font-medium">Erfolgreiche Scrapes</p>
                            <h3 className="text-2xl font-bold mt-1">{successCount}</h3>
                        </div>
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <div className="p-2 bg-primary/10 rounded-lg">
                                    <span className="material-symbols-outlined text-primary">bolt</span>
                                </div>
                                <span className="text-green-600 text-xs font-bold bg-green-50 px-2 py-1 rounded">
                                    +{mixFoundCount}
                                </span>
                            </div>
                            <p className="text-slate-500 text-sm font-medium">Daten extrahiert</p>
                            <h3 className="text-2xl font-bold mt-1">{mixFoundCount}</h3>
                        </div>
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <div className="p-2 bg-primary/10 rounded-lg">
                                    <span className="material-symbols-outlined text-primary">pending_actions</span>
                                </div>
                                {hasRunningJob && (
                                    <span className="text-primary text-xs font-bold bg-primary/10 px-2 py-1 rounded">
                                        Aktiv
                                    </span>
                                )}
                            </div>
                            <p className="text-slate-500 text-sm font-medium">Jobs in Warteschlange</p>
                            <h3 className="text-2xl font-bold mt-1">
                                {recentJobs.filter((j: any) => j.status === 'running').length}
                            </h3>
                        </div>
                    </div>

                    {/* Batch Controls & Job Monitor */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Batch Controls */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                            <div className="space-y-4">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-[#d5781a]">update</span>
                                        Batch-Verarbeitung
                                    </h3>
                                    <p className="text-sm text-slate-500 mt-1">
                                        Mehrere Provider nacheinander scrapen (4s Pause zwischen Jobs)
                                    </p>
                                </div>

                                {batchStatus?.isRunning && (
                                    <div>
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className="text-sm font-semibold text-[#d5781a]">
                                                Job {batchStatus.current} von {batchStatus.total}
                                            </span>
                                            {batchStatus.currentProvider && (
                                                <span className="text-xs text-slate-500">
                                                    → {batchStatus.currentProvider}
                                                </span>
                                            )}
                                        </div>
                                        <div className="w-full bg-slate-200 rounded-full h-2">
                                            <div
                                                className="h-2 rounded-full transition-all duration-300"
                                                style={{
                                                    width: `${(batchStatus.current / batchStatus.total) * 100}%`,
                                                    backgroundColor: '#d5781a',
                                                }}
                                            ></div>
                                        </div>
                                    </div>
                                )}

                                <div className="flex items-center gap-3 flex-wrap">
                                    {batchLoading || batchActive || batchStatus?.isRunning ? (
                                        <button
                                            type="button"
                                            onClick={handleStopBatch}
                                            className="inline-flex items-center gap-2 px-6 py-2.5 text-white font-semibold rounded-lg shadow-sm transition-all"
                                            style={{ backgroundColor: '#dc2626' }}
                                        >
                                            <span className="material-symbols-outlined text-base">stop</span>
                                            <span>Batch stoppen</span>
                                        </button>
                                    ) : (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => handleBatchScrape(50)}
                                                disabled={batchLoading}
                                                className="inline-flex items-center gap-2 px-6 py-2.5 text-white font-semibold rounded-lg shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
                                                style={{ backgroundColor: batchLoading ? '#94a3b8' : '#d5781a' }}
                                            >
                                                <span className="material-symbols-outlined text-base">play_arrow</span>
                                                <span>Erste 50 scrapen</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleBatchScrape()}
                                                disabled={batchLoading}
                                                className="inline-flex items-center gap-2 px-6 py-2.5 text-white font-semibold rounded-lg shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
                                                style={{ backgroundColor: batchLoading ? '#94a3b8' : '#d5781a' }}
                                            >
                                                <span className="material-symbols-outlined text-base">play_arrow</span>
                                                <span>Alle {totalProviders} scrapen</span>
                                            </button>
                                        </>
                                    )}

                                    {batchResult && !batchStatus?.isRunning && (
                                        <span
                                            className={`text-sm font-medium px-4 py-2 rounded-lg ${batchResult.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                                        >
                                            {batchResult.success ? '✅ ' : '❌ '} {batchResult.message}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Live Job Monitor */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-[#d5781a]">history</span>
                                        Live-Monitor
                                    </h3>
                                    {hasRunningJob && (
                                        <div className="flex items-center gap-2">
                                            <span className="relative flex h-3 w-3">
                                                <span
                                                    className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                                                    style={{ backgroundColor: '#d5781a' }}
                                                ></span>
                                                <span
                                                    className="relative inline-flex rounded-full h-3 w-3"
                                                    style={{ backgroundColor: '#d5781a' }}
                                                ></span>
                                            </span>
                                            <span className="text-xs font-semibold text-[#d5781a]">Aktiv</span>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                                    {recentJobs.length === 0 ? (
                                        <p className="text-sm text-slate-400 text-center py-4">
                                            Keine Jobs in der Warteschlange
                                        </p>
                                    ) : (
                                        recentJobs.slice(0, 5).map((job: any) => (
                                            <div
                                                key={job.id}
                                                className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-semibold text-slate-900 truncate">
                                                        {job.provider_name}
                                                    </div>
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
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Filter Bar */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                        <div className="flex flex-wrap gap-4 items-center">
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary/50 bg-white"
                            >
                                <option value="all">Alle Status</option>
                                <option value="success">Erfolgreich</option>
                                <option value="failed">Fehlgeschlagen</option>
                                <option value="partial">Teilweise</option>
                                <option value="running">Laufend</option>
                                <option value="never">Nie gescrapt</option>
                            </select>
                            <select
                                value={dataFilter}
                                onChange={(e) => setDataFilter(e.target.value)}
                                className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary/50 bg-white"
                            >
                                <option value="all">Alle Daten</option>
                                <option value="with_data">Mit Strommix</option>
                                <option value="no_data">Ohne Strommix</option>
                                <option value="low_confidence">Niedrige Konfidenz (&lt;40%)</option>
                            </select>
                            <select
                                value={reviewFilter}
                                onChange={(e) => setReviewFilter(e.target.value)}
                                className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary/50 bg-white"
                            >
                                <option value="all">Alle Prüfstatus</option>
                                <option value="offen">Offen</option>
                                <option value="geprueft">Geprüft</option>
                                <option value="beanstandet">Beanstandet</option>
                            </select>
                            {(searchQuery ||
                                statusFilter !== 'all' ||
                                dataFilter !== 'all' ||
                                reviewFilter !== 'all') && (
                                <button
                                    onClick={() => {
                                        setSearchQuery('');
                                        setStatusFilter('all');
                                        setDataFilter('all');
                                        setReviewFilter('all');
                                    }}
                                    className="text-xs text-red-600 hover:text-red-800 font-medium px-3 py-2 border border-red-200 rounded-lg hover:border-red-400 flex items-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-sm">clear</span>
                                    Filter zurücksetzen
                                </button>
                            )}
                            <span className="text-xs text-slate-400 ml-auto">
                                {filteredProviders.length} von {providers.length} Anbieter
                            </span>
                        </div>
                    </div>

                    {/* Provider Table */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">table_chart</span>
                                Anbieter-Verwaltung
                            </h3>
                            <button
                                onClick={refreshData}
                                className="text-primary text-sm font-semibold hover:underline flex items-center gap-1"
                            >
                                <span className="material-symbols-outlined text-sm">refresh</span>
                                Aktualisieren
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider">
                                    <tr>
                                        <th
                                            onClick={() => handleSort('name')}
                                            className="px-6 py-4 cursor-pointer hover:text-primary"
                                        >
                                            Anbieter / Stadt{' '}
                                            {sortColumn === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
                                        </th>
                                        <th
                                            onClick={() => handleSort('file_number')}
                                            className="px-6 py-4 cursor-pointer hover:text-primary"
                                        >
                                            Aktenzeichen{' '}
                                            {sortColumn === 'file_number' && (sortDirection === 'asc' ? '↑' : '↓')}
                                        </th>
                                        <th
                                            onClick={() => handleSort('latest_job_status')}
                                            className="px-6 py-4 cursor-pointer hover:text-primary"
                                        >
                                            Status{' '}
                                            {sortColumn === 'latest_job_status' &&
                                                (sortDirection === 'asc' ? '↑' : '↓')}
                                        </th>
                                        <th
                                            onClick={() => handleSort('last_renewable_percentage')}
                                            className="px-6 py-4 cursor-pointer hover:text-primary"
                                        >
                                            Strommix{' '}
                                            {sortColumn === 'last_renewable_percentage' &&
                                                (sortDirection === 'asc' ? '↑' : '↓')}
                                        </th>
                                        <th
                                            onClick={() => handleSort('review_status')}
                                            className="px-6 py-4 cursor-pointer hover:text-primary"
                                        >
                                            Prüfung{' '}
                                            {sortColumn === 'review_status' && (sortDirection === 'asc' ? '↑' : '↓')}
                                        </th>
                                        <th className="px-6 py-4 text-right">Aktion</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {paginatedProviders.map((provider: any, index: number) => (
                                        <tr
                                            key={provider.id}
                                            id={`provider-${provider.id}`}
                                            className={`transition-colors hover:bg-primary/5 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                                        >
                                            <td className="px-6 py-4">
                                                <div className="text-sm font-semibold text-slate-900">
                                                    {provider.name}
                                                </div>
                                                <div className="text-xs text-slate-400">{provider.city || '-'}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                {editingFileNumber === provider.id ? (
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="text"
                                                            value={fileNumberValue}
                                                            onChange={(e) => setFileNumberValue(e.target.value)}
                                                            placeholder="12 122/123"
                                                            className="w-28 px-2 py-1 text-sm border border-primary/30 rounded focus:ring-2 focus:ring-primary/50"
                                                            autoFocus
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    handleFileNumberEdit(provider.id, fileNumberValue);
                                                                } else if (e.key === 'Escape') {
                                                                    cancelEditingFileNumber();
                                                                }
                                                            }}
                                                        />
                                                        <button
                                                            onClick={() =>
                                                                handleFileNumberEdit(provider.id, fileNumberValue)
                                                            }
                                                            className="text-green-600 hover:text-green-800 text-xs font-bold"
                                                        >
                                                            ✓
                                                        </button>
                                                        <button
                                                            onClick={cancelEditingFileNumber}
                                                            className="text-red-600 hover:text-red-800 text-xs font-bold"
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div
                                                        onClick={() =>
                                                            startEditingFileNumber(provider.id, provider.file_number)
                                                        }
                                                        className="cursor-pointer hover:bg-primary/5 px-2 py-1 rounded"
                                                    >
                                                        {provider.file_number ? (
                                                            <span className="text-sm font-mono text-slate-700">
                                                                {provider.file_number}
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs text-slate-300">+ hinzufügen</span>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <StatusBadge status={provider.latest_job_status} />
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                {provider.last_mix_year ? (
                                                    <div className="flex flex-col">
                                                        <div className="flex items-center gap-1">
                                                            <span className="font-bold text-green-700">
                                                                {provider.last_renewable_percentage ?? 0}% EE
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            <span className="text-xs text-slate-400">
                                                                ({provider.last_mix_year})
                                                            </span>
                                                            {provider.last_confidence != null && (
                                                                <ConfidenceBadge
                                                                    confidence={provider.last_confidence}
                                                                />
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-slate-300">-</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <ReviewStatusSelect
                                                    status={provider.review_status || 'offen'}
                                                    onChange={(s: string) => handleReviewStatus(provider.id, s)}
                                                />
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right">
                                                <button
                                                    onClick={() => setSelectedProvider(provider)}
                                                    className="text-primary hover:text-primary/80 font-medium text-sm border border-primary/20 hover:border-primary/40 px-3 py-1 rounded-lg transition-all shadow-sm bg-white flex items-center gap-1 ml-auto"
                                                >
                                                    <span className="material-symbols-outlined text-sm">
                                                        open_in_new
                                                    </span>
                                                    Details
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                    <span>
                                        Zeige {(currentPage - 1) * pageSize + 1}–
                                        {Math.min(currentPage * pageSize, sortedProviders.length)} von{' '}
                                        {sortedProviders.length}
                                    </span>
                                    <select
                                        value={pageSize}
                                        onChange={(e) => {
                                            setPageSize(Number(e.target.value));
                                            setCurrentPage(1);
                                        }}
                                        className="ml-2 px-2 py-1 border border-slate-200 rounded text-xs bg-white"
                                    >
                                        <option value={25}>25 pro Seite</option>
                                        <option value={50}>50 pro Seite</option>
                                        <option value={100}>100 pro Seite</option>
                                        <option value={999999}>Alle</option>
                                    </select>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => setCurrentPage(1)}
                                        disabled={currentPage === 1}
                                        className="px-2 py-1 text-xs rounded border border-slate-200 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        ««
                                    </button>
                                    <button
                                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                        className="px-2 py-1 text-xs rounded border border-slate-200 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        «
                                    </button>
                                    <span className="px-3 py-1 text-xs font-bold text-slate-700">
                                        {currentPage} / {totalPages}
                                    </span>
                                    <button
                                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                        className="px-2 py-1 text-xs rounded border border-slate-200 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        »
                                    </button>
                                    <button
                                        onClick={() => setCurrentPage(totalPages)}
                                        disabled={currentPage === totalPages}
                                        className="px-2 py-1 text-xs rounded border border-slate-200 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        »»
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <footer className="p-4 px-8 border-t border-slate-200 bg-white text-center text-xs text-slate-400">
                    © 2024 SKZ-Cockpit. Alle Rechte vorbehalten. | Stromkennzeichnung nach § 42 EnWG
                </footer>
            </main>

            {selectedProvider && (
                <ProviderModal
                    provider={selectedProvider}
                    onClose={() => setSelectedProvider(null)}
                    onRefresh={refreshData}
                />
            )}

            {showCreateModal && (
                <CreateProviderModal
                    onClose={() => setShowCreateModal(false)}
                    onSuccess={() => {
                        setShowCreateModal(false);
                        refreshData();
                    }}
                />
            )}
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    if (!status) return <span className="text-slate-300 text-xs">-</span>;

    const statusConfig: Record<string, { label: string; color: string }> = {
        success: { label: 'Erfolgreich', color: 'bg-green-100 text-green-700' },
        failed: { label: 'Fehlgeschlagen', color: 'bg-red-100 text-red-700' },
        running: { label: 'Laufend', color: 'bg-blue-100 text-blue-700' },
        partial: { label: 'Teilweise', color: 'bg-yellow-100 text-yellow-700' },
    };

    const config = statusConfig[status] ?? { label: status, color: 'bg-slate-100 text-slate-600' };

    return <span className={`px-3 py-1 rounded-full text-xs font-bold ${config.color}`}>{config.label}</span>;
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
    const color =
        confidence >= 70
            ? 'text-green-600 bg-green-50'
            : confidence >= 40
              ? 'text-yellow-600 bg-yellow-50'
              : 'text-red-600 bg-red-50';
    return <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${color}`}>{confidence}%</span>;
}

const reviewStatusConfig: Record<string, { label: string; color: string }> = {
    offen: { label: 'Offen', color: 'bg-slate-100 text-slate-600 border-slate-200' },
    geprueft: { label: 'Geprüft', color: 'bg-green-100 text-green-700 border-green-200' },
    beanstandet: { label: 'Beanstandet', color: 'bg-red-100 text-red-700 border-red-200' },
};

function ReviewStatusSelect({ status, onChange }: { status: string; onChange: (s: string) => void }) {
    const config = reviewStatusConfig[status] ??
        reviewStatusConfig['offen'] ?? { label: 'Offen', color: 'bg-slate-100 text-slate-600 border-slate-200' };
    return (
        <select
            value={status}
            onChange={(e) => onChange(e.target.value)}
            className={`text-xs font-bold px-2 py-1 rounded-full border cursor-pointer appearance-none text-center ${config.color}`}
        >
            <option value="offen">Offen</option>
            <option value="geprueft">Geprüft</option>
            <option value="beanstandet">Beanstandet</option>
        </select>
    );
}
