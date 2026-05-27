'use client';

import { useState, useEffect } from 'react';

interface AuditResult {
    provider_id: number;
    provider_name: string;
    file_number: string | null;
    delivered_volume_mwh: number;
    hkn_percentage: number;
    eeg_percentage: number;
    renewable_percentage: number;
    soll_mwh: number;
    ist_mwh: number;
    deviation_percent: number;
    difference_mwh: number;
    mix_point_diff: number;
    audit_status: string;
    audit_note: string | null;
    audited_by: string | null;
    audited_at: string | null;
}

interface ComplianceTabProps {
    currentYear: number;
    onYearChange: (year: number) => void;
}

export default function ComplianceTab({ currentYear, onYearChange }: ComplianceTabProps) {
    const [audits, setAudits] = useState<AuditResult[]>([]);
    const [constants, setConstants] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [visibleCount, setVisibleCount] = useState(10);

    // Filters
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [directionFilter, setDirectionFilter] = useState<string>('all');
    const [deviationThreshold, setDeviationThreshold] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState('');

    // Audit Modal State
    const [selectedAudit, setSelectedAudit] = useState<AuditResult | null>(null);
    const [auditorName, setAuditorName] = useState('');
    const [auditNote, setAuditNote] = useState('');
    const [auditStatus, setAuditStatus] = useState('plausibel');
    const [savingAudit, setSavingAudit] = useState(false);

    const fetchComplianceData = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/compliance/status?year=${currentYear}`);
            const json = await res.json();
            if (json.success) {
                setAudits(json.audits);
                setConstants(json.constants);
            }
        } catch (err) {
            console.error('Error fetching compliance data:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchComplianceData();
        setVisibleCount(10);
    }, [currentYear]);

    useEffect(() => {
        setVisibleCount(10);
    }, [statusFilter, directionFilter, deviationThreshold, searchQuery]);

    const handleOpenAuditModal = (audit: AuditResult) => {
        setSelectedAudit(audit);
        setAuditorName(audit.audited_by || '');
        setAuditNote(audit.audit_note || '');
        setAuditStatus(audit.audit_status === 'offen' ? 'plausibel' : audit.audit_status);
    };

    const handleSaveAudit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedAudit) return;

        if (!auditorName.trim()) {
            alert('Bitte geben Sie Ihren Namen als Prüfer an.');
            return;
        }

        setSavingAudit(true);
        try {
            const res = await fetch('/api/compliance/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider_id: selectedAudit.provider_id,
                    year: currentYear,
                    status: auditStatus,
                    audit_note: auditNote.trim() || null,
                    audited_by: auditorName.trim(),
                }),
            });

            if (res.ok) {
                setSelectedAudit(null);
                fetchComplianceData();
            } else {
                const data = await res.json();
                alert('Fehler beim Speichern: ' + (data.error || 'Unbekannt'));
            }
        } catch (err: any) {
            alert('Fehler beim Speichern: ' + err.message);
        } finally {
            setSavingAudit(false);
        }
    };

    // Filter Pipeline
    const filteredAudits = audits.filter((a) => {
        // Search
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const matches =
                a.provider_name.toLowerCase().includes(q) ||
                (a.file_number && a.file_number.toLowerCase().includes(q));
            if (!matches) return false;
        }

        // Status
        if (statusFilter !== 'all' && a.audit_status !== statusFilter) {
            return false;
        }

        // Direction
        if (directionFilter === 'under' && a.difference_mwh >= 0) {
            return false;
        }
        if (directionFilter === 'over' && a.difference_mwh <= 0) {
            return false;
        }

        // Deviation Threshold
        if (deviationThreshold) {
            const thresh = parseFloat(deviationThreshold);
            if (!isNaN(thresh)) {
                // We check absolute deviation percent
                if (Math.abs(a.deviation_percent) < thresh) {
                    return false;
                }
            }
        }

        return true;
    });

    const getStatusConfig = (status: string) => {
        switch (status) {
            case 'plausibel':
                return { label: 'Plausibel', color: 'bg-green-100 text-green-700 border-green-200' };
            case 'beanstandet':
                return { label: 'Beanstandet', color: 'bg-red-100 text-red-700 border-red-200' };
            case 'fehlerhaft_hkn':
                return { label: 'HKN fehlerhaft', color: 'bg-orange-100 text-orange-700 border-orange-200' };
            case 'fehlerhaft_eeg':
                return { label: 'EEG fehlerhaft', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' };
            case 'offen':
            default:
                return { label: 'Offen', color: 'bg-slate-100 text-slate-600 border-slate-200' };
        }
    };

    const formatPercent = (val: number) => {
        return val.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + '%';
    };

    const formatMwh = (val: number) => {
        return val.toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' MWh';
    };

    const years = [2023, 2024, 2025, 2026];

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Top Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">Einheit 2: Compliance & Audit Hub</h2>
                    <p className="text-slate-500">Soll/Ist-Abgleich der HKN-Quote und Ausstellung von Prüfvermerken (§ 42 EnWG)</p>
                    {constants && (
                        <div className="text-xs text-slate-500 mt-2 flex items-center gap-2">
                            <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-700/10">
                                Bund EE: {constants.renewable_percentage}%
                            </span>
                            <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-700/10">
                                Bund EEG: {constants.eeg_percentage}%
                            </span>
                            <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-700/10">
                                CO₂: {constants.co2_emission_g_kwh} g/kWh
                            </span>
                        </div>
                    )}
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

            {/* Filter Panel */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h4 className="font-bold text-slate-900 flex items-center gap-1.5 text-sm">
                        <span className="material-symbols-outlined text-primary text-lg">filter_alt</span>
                        Prüf- und Abweichungsfilter
                    </h4>
                    {(statusFilter !== 'all' || directionFilter !== 'all' || deviationThreshold || searchQuery) && (
                        <button
                            onClick={() => {
                                setStatusFilter('all');
                                setDirectionFilter('all');
                                setDeviationThreshold('');
                                setSearchQuery('');
                            }}
                            className="text-xs text-red-600 hover:text-red-800 font-semibold flex items-center gap-1"
                        >
                            <span className="material-symbols-outlined text-xs">clear</span>
                            Filter zurücksetzen
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {/* Search */}
                    <div className="lg:col-span-1">
                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Anbieter-Suche</label>
                        <input
                            type="text"
                            placeholder="Musterwerke..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/50 focus:outline-none"
                        />
                    </div>

                    {/* Status Filter */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Prüfstatus</label>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/50 focus:outline-none bg-white font-medium text-slate-700"
                        >
                            <option value="all">Alle Prüfstatus</option>
                            <option value="offen">Offen</option>
                            <option value="plausibel">Plausibel</option>
                            <option value="fehlerhaft_hkn">HKN fehlerhaft</option>
                            <option value="fehlerhaft_eeg">EEG fehlerhaft</option>
                            <option value="beanstandet">Beanstandet</option>
                        </select>
                    </div>

                    {/* Direction Filter */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Abweichungsrichtung</label>
                        <select
                            value={directionFilter}
                            onChange={(e) => setDirectionFilter(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/50 focus:outline-none bg-white font-medium text-slate-700"
                        >
                            <option value="all">Alle Richtungen</option>
                            <option value="under">Unterdeckung (Ist &lt; Soll)</option>
                            <option value="over">Überdeckung (Ist &gt; Soll)</option>
                        </select>
                    </div>

                    {/* Deviation Degree */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">
                            Abweichung ab (%)
                        </label>
                        <input
                            type="number"
                            placeholder="z.B. 5"
                            value={deviationThreshold}
                            onChange={(e) => setDeviationThreshold(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/50 focus:outline-none"
                            min="0"
                            max="100"
                        />
                    </div>

                    {/* Count display */}
                    <div className="flex items-end justify-end text-xs text-slate-400 font-semibold h-full pb-2">
                        {filteredAudits.length} von {audits.length} Prüfungen
                    </div>
                </div>
            </div>

            {/* Compliance Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-4">Aktenzeichen</th>
                                <th className="px-6 py-4">Energieversorger</th>
                                <th className="px-6 py-4">Menge (MWh)</th>
                                <th className="px-6 py-4">Soll-HKN (MWh / %)</th>
                                <th className="px-6 py-4">Ist-HKN (MWh / %)</th>
                                <th className="px-6 py-4">Abweichung</th>
                                <th className="px-6 py-4">Prüfstatus</th>
                                <th className="px-6 py-4">Prüfer / Prüfvermerk</th>
                                <th className="px-6 py-4 text-right">Aktion</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={9} className="text-center py-8 text-slate-400 text-sm">
                                        <span className="material-symbols-outlined animate-spin text-2xl align-middle mr-2 text-primary">
                                            refresh
                                        </span>
                                        Berechne und validiere Compliance-Kennzahlen...
                                    </td>
                                </tr>
                            ) : filteredAudits.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="text-center py-8 text-slate-400 text-sm">
                                        Keine Audit-Einträge mit diesen Filtereinstellungen vorhanden.
                                    </td>
                                </tr>
                            ) : (
                                filteredAudits.slice(0, visibleCount).map((a) => {
                                    const conf = getStatusConfig(a.audit_status);
                                    const isUndercovered = a.difference_mwh < 0;
                                    const devColor = isUndercovered
                                        ? 'text-red-600 bg-red-50 border-red-100'
                                        : a.difference_mwh > 0
                                          ? 'text-green-600 bg-green-50 border-green-100'
                                          : 'text-slate-600 bg-slate-50 border-slate-100';

                                    const calculatedMixHkn = a.delivered_volume_mwh > 0 ? (a.ist_mwh / a.delivered_volume_mwh) * 100 : 0;

                                    return (
                                        <tr key={a.provider_id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-slate-600">
                                                {a.file_number || '-'}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-semibold text-slate-900 text-sm">{a.provider_name}</div>
                                                {a.hkn_percentage > 0 ? (
                                                    <div className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider mt-0.5">
                                                        Soll-Mix HKN: {a.hkn_percentage}%
                                                    </div>
                                                ) : (
                                                    <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">
                                                        Kein Scrape-Mix vorliegend
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-xs font-semibold text-slate-700">
                                                {a.delivered_volume_mwh.toLocaleString('de-DE')} MWh
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-xs font-bold text-slate-900">
                                                    {formatMwh(a.soll_mwh)}
                                                </div>
                                                <div className="text-[10px] text-slate-400">{formatPercent(a.hkn_percentage)} Soll-Quote</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-xs font-bold text-slate-900">
                                                    {formatMwh(a.ist_mwh)}
                                                </div>
                                                <div className="text-[10px] text-slate-400">{formatPercent(calculatedMixHkn)} Ist-Quote</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span
                                                    className={`inline-flex flex-col px-2.5 py-1 rounded-lg border text-xs font-bold ${devColor}`}
                                                >
                                                    <span>
                                                        {a.difference_mwh > 0 ? '+' : ''}
                                                        {formatMwh(a.difference_mwh)}
                                                    </span>
                                                    <span className="text-[10px] opacity-80 text-center font-semibold">
                                                        {a.deviation_percent > 0 ? '+' : ''}
                                                        {a.deviation_percent}%
                                                    </span>
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${conf.color}`}>
                                                    {conf.label}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 max-w-[200px]">
                                                {a.audited_by ? (
                                                    <div className="space-y-0.5">
                                                        <div className="text-xs font-bold text-slate-800 flex items-center gap-1">
                                                            <span className="material-symbols-outlined text-xs text-slate-400">person</span>
                                                            {a.audited_by}
                                                        </div>
                                                        {a.audit_note && (
                                                            <div className="text-[11px] text-slate-500 italic truncate" title={a.audit_note}>
                                                                "{a.audit_note}"
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-slate-300">-</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right">
                                                <button
                                                    onClick={() => handleOpenAuditModal(a)}
                                                    className="text-primary hover:text-white border border-primary/20 hover:bg-primary hover:border-primary font-bold text-xs px-3.5 py-2 rounded-lg transition-all shadow-sm flex items-center gap-1 ml-auto"
                                                >
                                                    <span className="material-symbols-outlined text-xs">gavel</span>
                                                    Auditieren
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

            {filteredAudits.length > visibleCount && (
                <div className="flex justify-center gap-3 mt-4">
                    <button
                        type="button"
                        onClick={() => setVisibleCount((prev) => prev + 50)}
                        className="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm cursor-pointer"
                    >
                        Mehr anzeigen (+50)
                    </button>
                    <button
                        type="button"
                        onClick={() => setVisibleCount(filteredAudits.length)}
                        className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm cursor-pointer"
                    >
                        Alle {filteredAudits.length} anzeigen
                    </button>
                </div>
            )}

            {/* Audit Modal */}
            {selectedAudit && (
                <div
                    className="fixed inset-0 bg-black/55 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setSelectedAudit(null);
                    }}
                >
                    <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden animate-scale-up">
                        {/* Header */}
                        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center">
                            <div className="flex items-center gap-2.5">
                                <span className="material-symbols-outlined text-primary text-2xl">gavel</span>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900">Compliance Audit & Vermerk</h3>
                                    <p className="text-xs text-slate-400">
                                        Für {selectedAudit.provider_name} ({currentYear})
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedAudit(null)}
                                className="text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        {/* Body */}
                        <form onSubmit={handleSaveAudit}>
                            <div className="p-6 space-y-4">
                                {/* Calculation Summary */}
                                <div className="grid grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                                    <div className="text-center">
                                        <div className="text-[10px] text-slate-400 uppercase font-bold">Soll-Menge HKN</div>
                                        <div className="text-sm font-bold text-slate-800 mt-1">
                                            {formatMwh(selectedAudit.soll_mwh)}
                                        </div>
                                    </div>
                                    <div className="text-center border-x border-slate-200">
                                        <div className="text-[10px] text-slate-400 uppercase font-bold">Ist-Menge HKN</div>
                                        <div className="text-sm font-bold text-slate-800 mt-1">
                                            {formatMwh(selectedAudit.ist_mwh)}
                                        </div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-[10px] text-slate-400 uppercase font-bold">Abweichung</div>
                                        <div
                                            className={`text-sm font-bold mt-1 ${selectedAudit.difference_mwh < 0 ? 'text-red-600' : 'text-green-600'}`}
                                        >
                                            {selectedAudit.deviation_percent}%
                                        </div>
                                    </div>
                                </div>

                                {/* Auditor Name */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                                        Prüfer / Sachbearbeiter <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="z.B. Martin (Einheit 2)"
                                        value={auditorName}
                                        onChange={(e) => setAuditorName(e.target.value)}
                                        required
                                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white"
                                    />
                                </div>

                                {/* Audit Status selection */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                                        Prüfurteil / Compliance Status
                                    </label>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                        {[
                                            { id: 'plausibel', label: 'Plausibel', color: 'peer-checked:bg-green-50 peer-checked:text-green-800 peer-checked:border-green-300' },
                                            { id: 'fehlerhaft_hkn', label: 'HKN falsch', color: 'peer-checked:bg-orange-50 peer-checked:text-orange-800 peer-checked:border-orange-300' },
                                            { id: 'fehlerhaft_eeg', label: 'EEG falsch', color: 'peer-checked:bg-yellow-50 peer-checked:text-yellow-800 peer-checked:border-yellow-300' },
                                            { id: 'beanstandet', label: 'Beanstandet', color: 'peer-checked:bg-red-50 peer-checked:text-red-800 peer-checked:border-red-300' },
                                        ].map((opt) => (
                                            <div key={opt.id}>
                                                <input
                                                    type="radio"
                                                    id={`status-${opt.id}`}
                                                    name="audit-status"
                                                    value={opt.id}
                                                    checked={auditStatus === opt.id}
                                                    onChange={() => setAuditStatus(opt.id)}
                                                    className="peer hidden"
                                                />
                                                <label
                                                    htmlFor={`status-${opt.id}`}
                                                    className={`block text-center border border-slate-200 rounded-lg py-2.5 text-xs font-bold cursor-pointer text-slate-500 transition-all ${opt.color} hover:bg-slate-50`}
                                                >
                                                    {opt.label}
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Audit Note */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                                        Prüfvermerk / Anmerkung
                                    </label>
                                    <textarea
                                        placeholder="Dokumentieren Sie hier die Abweichungen, Klärungsergebnisse oder offene Mängel..."
                                        rows={4}
                                        value={auditNote}
                                        onChange={(e) => setAuditNote(e.target.value)}
                                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white"
                                    />
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex gap-3">
                                <button
                                    type="submit"
                                    disabled={savingAudit}
                                    className="flex-1 bg-primary hover:bg-primary/90 text-white py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-sm disabled:opacity-50"
                                >
                                    {savingAudit ? (
                                        <>
                                            <span className="material-symbols-outlined animate-spin text-sm">refresh</span>
                                            Speichere...
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined text-sm">assignment_turned_in</span>
                                            Audit-Ergebnis speichern
                                        </>
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSelectedAudit(null)}
                                    className="px-5 py-2.5 rounded-lg text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 transition-colors"
                                >
                                    Abbrechen
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
