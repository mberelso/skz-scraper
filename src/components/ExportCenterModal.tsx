'use client';

import { useState, useEffect, useRef } from 'react';

export default function ExportCenterModal({
    isOpen,
    onClose,
    initialSelectedIds,
    providers,
}: {
    isOpen: boolean;
    onClose: () => void;
    initialSelectedIds: number[];
    providers: any[];
}) {
    const [exportMode, setExportMode] = useState<'filter' | 'manual'>('filter');
    const [format, setFormat] = useState<'pdf' | 'csv'>('pdf');
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);

    // Filters
    const [year, setYear] = useState('2024');
    const [status, setStatus] = useState('all');

    const modalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            setSelectedIds(initialSelectedIds);
            setExportMode(initialSelectedIds.length > 0 ? 'manual' : 'filter');
        }
    }, [isOpen, initialSelectedIds]);

    useEffect(() => {
        if (isOpen) {
            modalRef.current?.focus();
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
                return;
            }

            if (e.key === 'Tab') {
                if (!modalRef.current) return;
                const focusableElements = modalRef.current.querySelectorAll(
                    'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, object, embed, [tabindex="0"], [contenteditable]'
                );
                const firstElement = focusableElements[0] as HTMLElement;
                const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

                if (focusableElements.length === 0) {
                    e.preventDefault();
                    return;
                }

                if (e.shiftKey) {
                    if (document.activeElement === firstElement) {
                        lastElement.focus();
                        e.preventDefault();
                    }
                } else {
                    if (document.activeElement === lastElement) {
                        firstElement.focus();
                        e.preventDefault();
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    // Filter query suggestions
    const searchResults = searchQuery.trim()
        ? providers
              .filter(
                  (p) => (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()) && !selectedIds.includes(p.id)
              )
              .slice(0, 5)
        : [];

    const addProvider = (id: number) => {
        setSelectedIds((prev) => [...prev, id]);
        setSearchQuery('');
    };

    const removeProvider = (id: number) => {
        setSelectedIds((prev) => prev.filter((item) => item !== id));
    };

    const handleExport = async () => {
        setLoading(true);
        try {
            const body: any = {
                mode: exportMode,
            };

            if (exportMode === 'manual') {
                body.providerIds = selectedIds;
            } else {
                body.filters = {
                    year,
                    reviewStatus: status,
                };
            }

            const endpoint = format === 'pdf' ? '/api/export/pdf' : '/api/export/csv';
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!res.ok) throw new Error('Export fehlgeschlagen');

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = format === 'pdf' ? 'skz-bericht.pdf' : 'skz-export.csv';
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (err: any) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Count estimation
    const exportCount =
        exportMode === 'manual'
            ? selectedIds.length
            : providers.filter((p) => {
                  if (status !== 'all' && (p.review_status || 'offen') !== status) return false;
                  if (year !== 'all' && p.last_mix_year !== Number(year)) return false;
                  return true;
              }).length;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div
                ref={modalRef}
                tabIndex={-1}
                className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col md:flex-row min-h-[400px] outline-none"
            >
                {/* Left Column: Filter Options */}
                <div className="flex-1 p-6 border-r border-slate-100 flex flex-col gap-4">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-bold text-slate-800">1. Export-Modus</h3>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                            ✕
                        </button>
                    </div>

                    {/* Mode Toggles */}
                    <div className="flex gap-2 bg-slate-100 p-1 rounded-lg">
                        <button
                            onClick={() => setExportMode('filter')}
                            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${exportMode === 'filter' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                        >
                            Nach Filter
                        </button>
                        <button
                            onClick={() => setExportMode('manual')}
                            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${exportMode === 'manual' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                        >
                            Manuelle Auswahl
                        </button>
                    </div>

                    {exportMode === 'filter' ? (
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-bold text-slate-500 block mb-1">Berichtsjahr</label>
                                <select
                                    value={year}
                                    onChange={(e) => setYear(e.target.value)}
                                    className="w-full border p-2 rounded text-sm bg-white"
                                >
                                    <option value="2024">2024</option>
                                    <option value="2023">2023</option>
                                    <option value="all">Alle Jahre</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 block mb-1">Prüfstatus</label>
                                <select
                                    value={status}
                                    onChange={(e) => setStatus(e.target.value)}
                                    className="w-full border p-2 rounded text-sm bg-white"
                                >
                                    <option value="all">Alle Status</option>
                                    <option value="offen">Offen</option>
                                    <option value="geprueft">Geprüft</option>
                                    <option value="beanstandet">Beanstandet</option>
                                </select>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3 flex-1 flex flex-col min-h-0">
                            <div className="relative">
                                <label className="text-xs font-bold text-slate-500 block mb-1">
                                    Provider suchen & hinzufügen
                                </label>
                                <input
                                    type="text"
                                    placeholder="Suchen..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full border p-2 rounded text-sm"
                                />
                                {searchResults.length > 0 && (
                                    <div className="absolute left-0 right-0 top-full bg-white border shadow-lg rounded-md mt-1 z-10 max-h-40 overflow-y-auto">
                                        {searchResults.map((p) => (
                                            <button
                                                key={p.id}
                                                onClick={() => addProvider(p.id)}
                                                className="w-full text-left p-2 hover:bg-slate-50 text-xs text-slate-700 block border-b last:border-0"
                                            >
                                                {p.name} ({p.city || 'unbekannt'})
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 overflow-y-auto max-h-48 border rounded-lg p-2 space-y-1.5 bg-slate-50">
                                {selectedIds.length === 0 ? (
                                    <span className="text-xs text-slate-400 block text-center py-6">
                                        Keine Provider ausgewählt
                                    </span>
                                ) : (
                                    selectedIds.map((id) => {
                                        const p = providers.find((item) => item.id === id);
                                        return (
                                            <div
                                                key={id}
                                                className="flex justify-between items-center bg-white border px-2 py-1 rounded text-xs"
                                            >
                                                <span className="truncate flex-1 font-medium">
                                                    {p?.name || `#${id}`}
                                                </span>
                                                <button
                                                    onClick={() => removeProvider(id)}
                                                    className="text-red-500 font-bold hover:text-red-700 ml-2"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}

                    <div className="flex gap-2 mt-auto">
                        <button
                            onClick={onClose}
                            className="flex-1 border p-2 rounded-lg text-sm text-slate-500 hover:bg-slate-50"
                        >
                            Abbrechen
                        </button>
                    </div>
                </div>

                {/* Right Column: Preview Pane */}
                <div className="w-full md:w-56 bg-slate-50 p-6 flex flex-col gap-6 justify-center items-center">
                    <div className="text-center font-bold text-slate-600 text-sm">Zusammenfassung</div>

                    <div className="w-16 h-20 bg-white border border-slate-200 rounded shadow-sm flex flex-col justify-between p-2">
                        <div className="h-1 bg-slate-100 rounded w-8"></div>
                        <div className="h-10 bg-indigo-50 flex items-center justify-center text-[10px] font-bold text-indigo-600 uppercase rounded">
                            {format}
                        </div>
                        <div className="h-1 bg-slate-100 rounded"></div>
                    </div>

                    <div className="text-center space-y-2">
                        <div className="text-xs font-bold text-indigo-600">{exportCount} Versorger</div>

                        <div className="flex gap-1.5 justify-center">
                            <button
                                onClick={() => setFormat('pdf')}
                                className={`px-3 py-1 rounded text-xs font-bold ${format === 'pdf' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white border text-slate-500'}`}
                            >
                                PDF
                            </button>
                            <button
                                onClick={() => setFormat('csv')}
                                className={`px-3 py-1 rounded text-xs font-bold ${format === 'csv' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white border text-slate-500'}`}
                            >
                                CSV
                            </button>
                        </div>
                    </div>

                    <button
                        onClick={handleExport}
                        disabled={loading || exportCount === 0}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg font-bold text-sm shadow-md transition disabled:opacity-50"
                    >
                        {loading ? 'Wird generiert...' : 'Export starten'}
                    </button>
                </div>
            </div>
        </div>
    );
}
