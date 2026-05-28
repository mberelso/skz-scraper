'use client';

import { useState, useEffect, useRef } from 'react';

interface Cancellation {
    country: string;
    amount_mwh: number;
}

interface MatchingProvider {
    id: number;
    name: string;
    file_number: string | null;
    delivered_volume_mwh: number;
    cancellations: Cancellation[];
}

interface MatchingTabProps {
    currentYear: number;
    onYearChange: (year: number) => void;
}

export default function MatchingTab({ currentYear, onYearChange }: MatchingTabProps) {
    const [providers, setProviders] = useState<MatchingProvider[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<{
        success: boolean;
        importedCount: number;
        failedCount: number;
        log: string[];
    } | null>(null);

    // Inline editing state for delivered volume
    const [editingVolumeProviderId, setEditingVolumeProviderId] = useState<number | null>(null);
    const [volumeValue, setVolumeValue] = useState<string>('');

    // Editing cancellations modal state
    const [editingCancellationsProvider, setEditingCancellationsProvider] = useState<MatchingProvider | null>(null);
    const [tempCancellations, setTempCancellations] = useState<Cancellation[]>([]);
    const [newCountry, setNewCountry] = useState('');
    const [newAmount, setNewAmount] = useState('');
    const [savingCancellations, setSavingCancellations] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchMatchingData = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/compliance/matching?year=${currentYear}`);
            const json = await res.json();
            if (json.success) {
                setProviders(json.data);
            }
        } catch (err) {
            console.error('Error fetching matching data:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMatchingData();
    }, [currentYear]);

    const handleCsvUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!csvFile) return;

        setImporting(true);
        setImportResult(null);

        try {
            const text = await csvFile.text();
            const res = await fetch('/api/compliance/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ csvData: text }),
            });
            const data = await res.json();

            if (res.ok && data.success) {
                setImportResult({
                    success: true,
                    importedCount: data.importedCount,
                    failedCount: data.failedCount,
                    log: data.log || [],
                });
                setCsvFile(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
                fetchMatchingData();
            } else {
                setImportResult({
                    success: false,
                    importedCount: 0,
                    failedCount: 0,
                    log: [data.error || 'Unbekannter Fehler beim Import'],
                });
            }
        } catch (err: any) {
            setImportResult({
                success: false,
                importedCount: 0,
                failedCount: 0,
                log: [err.message || 'Netzwerkfehler'],
            });
        } finally {
            setImporting(false);
        }
    };

    const handleSaveVolume = async (providerId: number) => {
        const volume = parseFloat(volumeValue);
        if (isNaN(volume) || volume < 0) {
            alert('Bitte eine gültige Zahl >= 0 eingeben.');
            return;
        }

        try {
            const res = await fetch('/api/compliance/matching', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider_id: providerId,
                    year: currentYear,
                    delivered_volume_mwh: volume,
                }),
            });

            if (res.ok) {
                setEditingVolumeProviderId(null);
                fetchMatchingData();
            } else {
                const data = await res.json();
                alert('Fehler beim Speichern: ' + (data.error || 'Unbekannt'));
            }
        } catch (err: any) {
            alert('Fehler beim Speichern: ' + err.message);
        }
    };

    const openCancellationsModal = (provider: MatchingProvider) => {
        setEditingCancellationsProvider(provider);
        setTempCancellations([...provider.cancellations]);
        setNewCountry('');
        setNewAmount('');
    };

    const handleAddCancellation = () => {
        const amount = parseFloat(newAmount);
        if (!newCountry.trim()) {
            alert('Bitte geben Sie ein Land ein.');
            return;
        }
        if (isNaN(amount) || amount <= 0) {
            alert('Bitte eine gültige Menge > 0 eingeben.');
            return;
        }

        const countryNorm = newCountry.trim();
        const existingIdx = tempCancellations.findIndex((c) => c.country.toLowerCase() === countryNorm.toLowerCase());

        if (existingIdx >= 0) {
            // Update existing
            const updated = [...tempCancellations];
            const item = updated[existingIdx];
            if (item) {
                item.amount_mwh += amount;
                setTempCancellations(updated);
            }
        } else {
            // Add new
            setTempCancellations([...tempCancellations, { country: countryNorm, amount_mwh: amount }]);
        }

        setNewCountry('');
        setNewAmount('');
    };

    const handleRemoveCancellation = (index: number) => {
        setTempCancellations(tempCancellations.filter((_, i) => i !== index));
    };

    const handleSaveCancellations = async () => {
        if (!editingCancellationsProvider) return;

        setSavingCancellations(true);
        try {
            const res = await fetch('/api/compliance/matching', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider_id: editingCancellationsProvider.id,
                    year: currentYear,
                    cancellations: tempCancellations,
                }),
            });

            if (res.ok) {
                setEditingCancellationsProvider(null);
                fetchMatchingData();
            } else {
                const data = await res.json();
                alert('Fehler beim Speichern: ' + (data.error || 'Unbekannt'));
            }
        } catch (err: any) {
            alert('Fehler beim Speichern: ' + err.message);
        } finally {
            setSavingCancellations(false);
        }
    };

    // Filtered providers list
    const filteredProviders = providers.filter((p) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return p.name.toLowerCase().includes(q) || (p.file_number && p.file_number.toLowerCase().includes(q));
    });

    const years = [2023, 2024, 2025, 2026];

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Header / Top Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">Einheit 1: Datenmatching & HKN-Erfassung</h2>
                    <p className="text-slate-500">
                        Zusammenführung von Liefervolumen und Herkunftsnachweisen (§ 42 EnWG)
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <label className="text-sm font-semibold text-slate-600">Berichtsjahr:</label>
                    <select
                        value={currentYear}
                        onChange={(e) => onYearChange(Number(e.target.value))}
                        className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary/50 bg-white font-bold"
                    >
                        {years.map((y) => (
                            <option key={y} value={y}>
                                {y}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* CSV Import Section */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-2">
                    <span className="material-symbols-outlined text-primary">upload_file</span>
                    HKN- & Mengen-Import (CSV)
                </h3>
                <p className="text-sm text-slate-500 mb-6">
                    Laden Sie die vom Umweltbundesamt (UBA) oder den Providern gemeldeten HKN-Entwertungen und
                    gelieferten Strommengen hoch.
                </p>

                <form onSubmit={handleCsvUpload} className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <input
                                type="file"
                                accept=".csv"
                                ref={fileInputRef}
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    setCsvFile(f || null);
                                }}
                                className="block w-full text-sm text-slate-500
                                           file:mr-4 file:py-2.5 file:px-4
                                           file:rounded-lg file:border-0
                                           file:text-sm file:font-semibold
                                           file:bg-indigo-50 file:text-indigo-700
                                           hover:file:bg-indigo-100
                                           border border-slate-200 rounded-lg p-1.5 bg-slate-50 cursor-pointer"
                            />
                            <button
                                type="submit"
                                disabled={!csvFile || importing}
                                className="bg-primary hover:bg-primary/95 text-white px-6 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                            >
                                {importing ? (
                                    <>
                                        <span className="material-symbols-outlined animate-spin text-base">
                                            refresh
                                        </span>
                                        Importiere...
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-base">publish</span>
                                        Hochladen
                                    </>
                                )}
                            </button>
                        </div>

                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs text-slate-600 space-y-2">
                            <div className="font-bold flex items-center gap-1.5 text-slate-800">
                                <span className="material-symbols-outlined text-sm">info</span>
                                Erwartetes CSV-Format:
                            </div>
                            <pre className="bg-white border border-slate-100 p-2.5 rounded font-mono text-[10px] text-slate-700 block overflow-x-auto">
                                anbieter_name,berichtsjahr,strommenge_mwh,hkn_land,hkn_menge_mwh{'\n'}
                                AggerEnergie GmbH,2024,85000,Norwegen,35000{'\n'}
                                Stadtwerke Leipzig AG,2024,240000,Island,80000
                            </pre>
                            <p>
                                * Der Importeur gleicht die Namen fehlertolerant ab (z.B. werden Rechtsformen wie GmbH
                                oder AG ignoriert).
                            </p>
                        </div>
                    </div>

                    {/* Import Log/Result */}
                    {importResult && (
                        <div
                            className={`p-5 rounded-lg border text-sm space-y-3 ${
                                importResult.success
                                    ? 'bg-green-50/50 border-green-200 text-green-800'
                                    : 'bg-red-50/50 border-red-200 text-red-800'
                            }`}
                        >
                            <div className="flex items-center gap-2 font-bold">
                                <span className="material-symbols-outlined">
                                    {importResult.success ? 'check_circle' : 'error'}
                                </span>
                                {importResult.success ? 'Import erfolgreich durchgeführt' : 'Import fehlgeschlagen'}
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-xs font-semibold">
                                <div className="bg-white p-3 rounded border border-slate-100 shadow-sm">
                                    <div className="text-slate-500">Erfolgreich importiert:</div>
                                    <div className="text-xl text-green-600">
                                        {importResult.importedCount} Datensätze
                                    </div>
                                </div>
                                <div className="bg-white p-3 rounded border border-slate-100 shadow-sm">
                                    <div className="text-slate-500">Fehlgeschlagen / Ignoriert:</div>
                                    <div className="text-xl text-red-500">{importResult.failedCount} Zeilen</div>
                                </div>
                            </div>
                            {importResult.log.length > 0 && (
                                <div className="space-y-1.5">
                                    <div className="text-xs font-bold text-slate-700">Protokoll-Hinweise:</div>
                                    <ul className="max-h-28 overflow-y-auto text-[11px] font-mono list-disc list-inside bg-white p-2.5 rounded border border-slate-100 space-y-1">
                                        {importResult.log.map((logMsg, i) => (
                                            <li key={i} className="text-slate-600">
                                                {logMsg}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                </form>
            </div>

            {/* Providers Data Matching List */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">analytics</span>
                        Erfasste Liefer- & HKN-Mengen ({currentYear})
                    </h3>
                    <div className="relative w-full max-w-xs">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                            search
                        </span>
                        <input
                            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary/50 text-sm"
                            placeholder="Provider filtern..."
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-4">Aktenzeichen</th>
                                <th className="px-6 py-4">Energieversorger</th>
                                <th className="px-6 py-4">Gelieferte Strommenge (MWh)</th>
                                <th className="px-6 py-4">Entwertete HKN gesamt (MWh)</th>
                                <th className="px-6 py-4">Entwertungen nach Ländern</th>
                                <th className="px-6 py-4 text-right">Aktion</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="text-center py-8 text-slate-400 text-sm">
                                        <span className="material-symbols-outlined animate-spin text-2xl align-middle mr-2 text-primary">
                                            refresh
                                        </span>
                                        Lade Matching-Daten...
                                    </td>
                                </tr>
                            ) : filteredProviders.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="text-center py-8 text-slate-400 text-sm">
                                        Keine Provider mit diesen Kriterien gefunden.
                                    </td>
                                </tr>
                            ) : (
                                filteredProviders.map((provider) => {
                                    const totalHkn = provider.cancellations.reduce(
                                        (acc, curr) => acc + curr.amount_mwh,
                                        0
                                    );

                                    return (
                                        <tr key={provider.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-slate-600">
                                                {provider.file_number || '-'}
                                            </td>
                                            <td className="px-6 py-4 font-semibold text-slate-900 text-sm">
                                                {provider.name}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                {editingVolumeProviderId === provider.id ? (
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="number"
                                                            value={volumeValue}
                                                            onChange={(e) => setVolumeValue(e.target.value)}
                                                            className="w-32 px-2.5 py-1.5 text-sm border border-primary/30 rounded-lg focus:ring-2 focus:ring-primary/50 focus:outline-none"
                                                            autoFocus
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') handleSaveVolume(provider.id);
                                                                if (e.key === 'Escape')
                                                                    setEditingVolumeProviderId(null);
                                                            }}
                                                        />
                                                        <button
                                                            onClick={() => handleSaveVolume(provider.id)}
                                                            className="text-green-600 hover:text-green-800 text-xs font-bold bg-green-50 p-1.5 rounded-lg border border-green-200"
                                                        >
                                                            ✔
                                                        </button>
                                                        <button
                                                            onClick={() => setEditingVolumeProviderId(null)}
                                                            className="text-red-600 hover:text-red-800 text-xs font-bold bg-red-50 p-1.5 rounded-lg border border-red-200"
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div
                                                        onClick={() => {
                                                            setEditingVolumeProviderId(provider.id);
                                                            setVolumeValue(provider.delivered_volume_mwh.toString());
                                                        }}
                                                        className="cursor-pointer hover:bg-slate-100/80 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 text-sm font-bold text-slate-800 transition-colors"
                                                    >
                                                        {provider.delivered_volume_mwh.toLocaleString('de-DE')} MWh
                                                        <span className="material-symbols-outlined text-[14px] text-slate-400">
                                                            edit
                                                        </span>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-900">
                                                {totalHkn.toLocaleString('de-DE')} MWh
                                            </td>
                                            <td className="px-6 py-4">
                                                {provider.cancellations.length === 0 ? (
                                                    <span className="text-xs text-slate-400">Keine Entwertungen</span>
                                                ) : (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {provider.cancellations.map((c, i) => (
                                                            <span
                                                                key={i}
                                                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200"
                                                            >
                                                                <span className="font-bold text-slate-800">
                                                                    {c.country}:
                                                                </span>
                                                                {c.amount_mwh.toLocaleString('de-DE')} MWh
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right">
                                                <button
                                                    onClick={() => openCancellationsModal(provider)}
                                                    className="text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-300 bg-indigo-50/50 hover:bg-indigo-50 font-semibold text-xs px-3.5 py-2 rounded-lg transition-all flex items-center gap-1 ml-auto shadow-sm"
                                                >
                                                    <span className="material-symbols-outlined text-xs">edit_note</span>
                                                    HKN editieren
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* HKN Cancellations Edit Modal */}
            {editingCancellationsProvider && (
                <div
                    className="fixed inset-0 bg-black/55 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setEditingCancellationsProvider(null);
                    }}
                >
                    <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden animate-scale-up">
                        {/* Header */}
                        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center">
                            <div className="flex items-center gap-2.5">
                                <span className="material-symbols-outlined text-primary text-2xl">verified</span>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900">HKN-Entwertungen anpassen</h3>
                                    <p className="text-xs text-slate-400">
                                        Für {editingCancellationsProvider.name} ({currentYear})
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setEditingCancellationsProvider(null)}
                                className="text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-6 space-y-5">
                            {/* List of current temp cancellations */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    Aktuell gelistete Entwertungen
                                </label>
                                {tempCancellations.length === 0 ? (
                                    <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-lg text-sm text-slate-400">
                                        Keine Herkunftsnachweise für diesen Versorger eingetragen.
                                    </div>
                                ) : (
                                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                        {tempCancellations.map((c, i) => (
                                            <div
                                                key={i}
                                                className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-sm font-semibold"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-slate-400 text-lg">
                                                        flag
                                                    </span>
                                                    <span className="text-slate-800">{c.country}</span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-slate-900 font-bold">
                                                        {c.amount_mwh.toLocaleString('de-DE')} MWh
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveCancellation(i)}
                                                        className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded-md transition-colors"
                                                    >
                                                        <span className="material-symbols-outlined text-base">
                                                            delete
                                                        </span>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Add New Cancellation Form */}
                            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                                <label className="text-xs font-bold text-slate-700 block">
                                    Neuen HKN-Posten hinzufügen
                                </label>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <input
                                            type="text"
                                            placeholder="Land (z.B. Norwegen)"
                                            value={newCountry}
                                            onChange={(e) => setNewCountry(e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white"
                                        />
                                    </div>
                                    <div>
                                        <input
                                            type="number"
                                            placeholder="Menge (MWh)"
                                            value={newAmount}
                                            onChange={(e) => setNewAmount(e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    handleAddCancellation();
                                                }
                                            }}
                                        />
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleAddCancellation}
                                    className="w-full bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1"
                                >
                                    <span className="material-symbols-outlined text-sm">add</span>
                                    Zur Liste hinzufügen
                                </button>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex gap-3">
                            <button
                                type="button"
                                onClick={handleSaveCancellations}
                                disabled={savingCancellations}
                                className="flex-1 bg-primary hover:bg-primary/90 text-white py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-sm disabled:opacity-50"
                            >
                                {savingCancellations ? (
                                    <>
                                        <span className="material-symbols-outlined animate-spin text-sm">refresh</span>
                                        Speichere...
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-sm">save</span>
                                        Änderungen speichern
                                    </>
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={() => setEditingCancellationsProvider(null)}
                                className="px-5 py-2.5 rounded-lg text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 transition-colors"
                            >
                                Abbrechen
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
