'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface HknOrigin {
    country: string;
    percentage: number;
}

interface ArchiveDoc {
    id: number;
    file_type: string;
    source_url: string | null;
    original_filename: string | null;
    reporting_year: number | null;
    created_at: string;
    mix_id: number | null;
    mix_year: number | null;
    renewable_percentage: number | null;
    fossil_percentage: number | null;
    nuclear_percentage: number | null;
    eeg_funded_percentage: number | null;
    hkn_percentage: number | null;
    mieterstrom_percentage: number | null;
    co2_emission_g_kwh: number | null;
    radioactive_waste_mg_kwh: number | null;
    confidence: number | null;
    extraction_method: string | null;
    tariff_name: string | null;
    mix_type: string | null;
    source_status: string | null;
    hkn_origins: HknOrigin[] | null;
}

// Bundesmix-Referenzdaten (BDEW, offizielle Stromkennzeichnung Deutschland)
const BUNDESMIX: Record<number, { ee: number; fossil: number; nuclear: number; co2: number }> = {
    2023: { ee: 51.8, fossil: 39.5, nuclear: 1.5, co2: 380 },
    2022: { ee: 44.1, fossil: 42.9, nuclear: 6.4, co2: 434 },
    2021: { ee: 42.0, fossil: 44.3, nuclear: 6.4, co2: 420 },
    2020: { ee: 45.5, fossil: 40.5, nuclear: 6.1, co2: 366 },
};

const formatModalDate = (dateVal: any) => {
    if (!dateVal) return '-';
    let val = dateVal;
    if (typeof dateVal === 'string') {
        val = dateVal.replace(' ', 'T');
    }
    const d = new Date(val);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
};

export default function ProviderModal({
    provider,
    onClose,
    onRefresh,
    onScrapeStarted,
}: {
    provider: any;
    onClose: () => void;
    onRefresh: () => void;
    onScrapeStarted?: () => void;
}) {
    const [url, setUrl] = useState(provider.skz_url || '');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [archiveDocs, setArchiveDocs] = useState<ArchiveDoc[]>([]);
    const [archiveLoading, setArchiveLoading] = useState(true);

    // Edit state for energy mix data
    const [editingMixId, setEditingMixId] = useState<number | null>(null);
    const [editFormData, setEditFormData] = useState<any>({});
    const [editLoading, setEditLoading] = useState(false);
    const [editResult, setEditResult] = useState<any>(null);

    // Add new entry state
    const [isAddingNew, setIsAddingNew] = useState(false);
    const [newEntryFormData, setNewEntryFormData] = useState<any>({
        year: new Date().getFullYear(),
        renewable_percentage: '',
        fossil_percentage: '',
        nuclear_percentage: '',
        co2_emission_g_kwh: '',
        tariff_name: '',
    });
    const [newEntryLoading, setNewEntryLoading] = useState(false);
    const [newEntryResult, setNewEntryResult] = useState<any>(null);

    // Audit log state
    const [auditLog, setAuditLog] = useState<any[]>([]);
    const [auditExpanded, setAuditExpanded] = useState(false);

    // Notes state
    const [notes, setNotes] = useState<{ id: number; text: string; created_at: string; updated_at: string }[]>([]);
    const [notesExpanded, setNotesExpanded] = useState(false);
    const [newNoteText, setNewNoteText] = useState('');
    const [noteSaving, setNoteSaving] = useState(false);

    // Review mode state
    const [reviewingDoc, setReviewingDoc] = useState<ArchiveDoc | null>(null);
    const [reviewFormData, setReviewFormData] = useState<any>({});
    const [reviewSaving, setReviewSaving] = useState(false);
    const [reviewResult, setReviewResult] = useState<any>(null);

    // Provider edit state
    const [isEditingProvider, setIsEditingProvider] = useState(false);
    const [providerFormData, setProviderFormData] = useState<any>({});
    const [providerSaving, setProviderSaving] = useState(false);
    const [providerResult, setProviderResult] = useState<any>(null);

    // Modal ref for focus trap
    const modalRef = useRef<HTMLDivElement>(null);

    // Load audit log
    useEffect(() => {
        async function loadAudit() {
            try {
                const res = await fetch(`/api/audit?provider_id=${provider.id}`);
                if (res.ok) {
                    setAuditLog(await res.json());
                }
            } catch {
                /* ignore */
            }
        }
        loadAudit();
    }, [provider.id]);

    // Load notes
    const loadNotes = useCallback(async () => {
        try {
            const res = await fetch(`/api/providers/${provider.id}/notes`);
            if (res.ok) setNotes(await res.json());
        } catch {
            /* ignore */
        }
    }, [provider.id]);

    useEffect(() => {
        loadNotes();
    }, [loadNotes]);

    const handleSaveNote = async () => {
        const text = newNoteText.trim();
        if (!text) return;
        setNoteSaving(true);
        try {
            const res = await fetch(`/api/providers/${provider.id}/notes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
            });
            if (res.ok) {
                setNewNoteText('');
                await loadNotes();
            }
        } catch {
            /* ignore */
        } finally {
            setNoteSaving(false);
        }
    };

    const handleDeleteNote = async (noteId: number) => {
        if (!confirm('Notiz wirklich löschen?')) return;
        try {
            await fetch(`/api/providers/${provider.id}/notes/${noteId}`, { method: 'DELETE' });
            await loadNotes();
        } catch {
            /* ignore */
        }
    };

    // Load archive documents on mount
    useEffect(() => {
        async function loadArchive() {
            try {
                const res = await fetch(`/api/providers/${provider.id}/documents`);
                if (res.ok) {
                    const data = await res.json();
                    setArchiveDocs(data);
                }
            } catch {
                // silently fail
            } finally {
                setArchiveLoading(false);
            }
        }
        loadArchive();
    }, [provider.id]);

    const handleScrape = async () => {
        setLoading(true);
        setResult(null);
        try {
            const body: any = { providerId: provider.id, providerName: provider.name };
            if (url.trim()) body.url = url.trim();

            const res = await fetch('/api/scrape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error);

            setResult({
                success: true,
                message: data.message || 'Job gestartet! Status wird live im Dashboard aktualisiert.',
            });

            if (onScrapeStarted) {
                onScrapeStarted();
            }

            setTimeout(() => onRefresh(), 2000);
        } catch (err: any) {
            setResult({ success: false, message: err.message });
        } finally {
            setLoading(false);
        }
    };

    // Provider Edit Handlers
    const startEditingProvider = () => {
        setIsEditingProvider(true);
        setProviderFormData({
            name: provider.name || '',
            url: provider.url || '',
            skz_url: provider.skz_url || '',
            address: provider.address || '',
            zip: provider.zip || '',
            city: provider.city || '',
            file_number: provider.file_number || '',
            priority: provider.priority ?? '',
            review_status: provider.review_status || 'offen',
        });
        setProviderResult(null);
    };

    const cancelEditingProvider = () => {
        setIsEditingProvider(false);
        setProviderFormData({});
        setProviderResult(null);
    };

    const handleSaveProvider = async () => {
        setProviderSaving(true);
        setProviderResult(null);
        try {
            const payload: any = {
                name: providerFormData.name.trim(),
                url: providerFormData.url.trim() || null,
                skz_url: providerFormData.skz_url.trim() || null,
                address: providerFormData.address.trim() || null,
                zip: providerFormData.zip.trim() || null,
                city: providerFormData.city.trim() || null,
                file_number: providerFormData.file_number.trim() || null,
                priority: providerFormData.priority ? parseInt(providerFormData.priority) : null,
                review_status: providerFormData.review_status,
            };

            const res = await fetch(`/api/providers/${provider.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Fehler beim Speichern');
            }

            const data = await res.json();
            setProviderResult({ success: true, message: data.message });
            setIsEditingProvider(false);

            // Refresh parent dashboard
            setTimeout(() => onRefresh(), 1000);
        } catch (err: any) {
            setProviderResult({ success: false, message: err.message });
        } finally {
            setProviderSaving(false);
        }
    };

    const handleDeleteProvider = async () => {
        if (
            !confirm(
                `Provider "${provider.name}" wirklich löschen?\n\nAlle zugehörigen Daten (Scrape-Jobs, Dokumente, Energy Mix, Notizen) werden unwiderruflich gelöscht!`
            )
        ) {
            return;
        }

        try {
            const res = await fetch(`/api/providers/${provider.id}`, {
                method: 'DELETE',
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Fehler beim Löschen');
            }

            const data = await res.json();
            alert(`✅ ${data.message}`);
            onClose();
            onRefresh();
        } catch (err: any) {
            alert(`❌ Fehler: ${err.message}`);
        }
    };

    // Edit Handlers
    const fetchArchiveData = async () => {
        setArchiveLoading(true);
        try {
            const res = await fetch(`/api/providers/${provider.id}/documents`);
            if (res.ok) {
                const data = await res.json();
                setArchiveDocs(data);
            }
        } catch {
            // silently fail
        } finally {
            setArchiveLoading(false);
        }
    };

    const startEditingMix = (row: ArchiveDoc) => {
        setEditingMixId(row.mix_id);
        setEditFormData({
            year: row.mix_year || '',
            renewable_percentage: row.renewable_percentage ?? '',
            fossil_percentage: row.fossil_percentage ?? '',
            nuclear_percentage: row.nuclear_percentage ?? '',
            eeg_funded_percentage: row.eeg_funded_percentage ?? '',
            hkn_percentage: row.hkn_percentage ?? '',
            mieterstrom_percentage: row.mieterstrom_percentage ?? '',
            co2_emission_g_kwh: row.co2_emission_g_kwh ?? '',
            radioactive_waste_mg_kwh: row.radioactive_waste_mg_kwh ?? '',
            tariff_name: row.tariff_name || '',
            confidence: row.confidence ?? '',
            hkn_origins: row.hkn_origins || [],
        });
        setEditResult(null);
    };

    const cancelEditingMix = () => {
        setEditingMixId(null);
        setEditFormData({});
        setEditResult(null);
    };

    const handleSaveMix = async () => {
        if (!editingMixId) return;

        setEditLoading(true);
        setEditResult(null);
        try {
            const res = await fetch(`/api/energy-mix/${editingMixId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editFormData),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error);
            }

            setEditResult({ success: true, message: 'Daten gespeichert' });
            setEditingMixId(null);

            // Refresh archive data
            await fetchArchiveData();
            onRefresh(); // Refresh parent dashboard
        } catch (err: any) {
            setEditResult({ success: false, message: err.message });
        } finally {
            setEditLoading(false);
        }
    };

    const handleDeleteMix = async (mixId: number) => {
        if (!confirm('Eintrag wirklich löschen?')) return;

        try {
            const res = await fetch(`/api/energy-mix/${mixId}`, {
                method: 'DELETE',
            });

            if (!res.ok) throw new Error('Löschen fehlgeschlagen');

            await fetchArchiveData();
            onRefresh();
        } catch (err: any) {
            alert('Fehler beim Löschen: ' + err.message);
        }
    };

    const startAddingNew = () => {
        setIsAddingNew(true);
        setNewEntryFormData({
            year: new Date().getFullYear(),
            renewable_percentage: '',
            fossil_percentage: '',
            nuclear_percentage: '',
            eeg_funded_percentage: '',
            hkn_percentage: '',
            mieterstrom_percentage: '',
            co2_emission_g_kwh: '',
            tariff_name: '',
            hkn_origins: [],
        });
        setNewEntryResult(null);
    };

    const cancelAddingNew = () => {
        setIsAddingNew(false);
        setNewEntryFormData({});
        setNewEntryResult(null);
    };

    const handleSaveNewEntry = async () => {
        setNewEntryLoading(true);
        setNewEntryResult(null);
        try {
            const parseNum = (v: any) => (v !== '' && v != null ? parseFloat(v) : null);
            const res = await fetch('/api/energy-mix', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider_id: provider.id,
                    year: parseInt(newEntryFormData.year),
                    renewable_percentage: parseNum(newEntryFormData.renewable_percentage),
                    fossil_percentage: parseNum(newEntryFormData.fossil_percentage),
                    nuclear_percentage: parseNum(newEntryFormData.nuclear_percentage),
                    eeg_funded_percentage: parseNum(newEntryFormData.eeg_funded_percentage),
                    hkn_percentage: parseNum(newEntryFormData.hkn_percentage),
                    mieterstrom_percentage: parseNum(newEntryFormData.mieterstrom_percentage),
                    co2_emission_g_kwh: parseNum(newEntryFormData.co2_emission_g_kwh),
                    tariff_name: newEntryFormData.tariff_name || null,
                    hkn_origins: newEntryFormData.hkn_origins?.length > 0 ? newEntryFormData.hkn_origins : null,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error);
            }

            setNewEntryResult({ success: true, message: 'Eintrag erfolgreich erstellt' });
            setIsAddingNew(false);

            // Refresh archive data
            await fetchArchiveData();
            onRefresh(); // Refresh parent dashboard
        } catch (err: any) {
            setNewEntryResult({ success: false, message: err.message });
        } finally {
            setNewEntryLoading(false);
        }
    };

    // Review mode handlers
    const startReview = (doc: ArchiveDoc) => {
        setReviewingDoc(doc);
        setReviewFormData({
            year: doc.mix_year || doc.reporting_year || new Date().getFullYear(),
            renewable_percentage: doc.renewable_percentage ?? '',
            fossil_percentage: doc.fossil_percentage ?? '',
            nuclear_percentage: doc.nuclear_percentage ?? '',
            eeg_funded_percentage: doc.eeg_funded_percentage ?? '',
            hkn_percentage: doc.hkn_percentage ?? '',
            mieterstrom_percentage: doc.mieterstrom_percentage ?? '',
            co2_emission_g_kwh: doc.co2_emission_g_kwh ?? '',
            radioactive_waste_mg_kwh: doc.radioactive_waste_mg_kwh ?? '',
            confidence: doc.confidence ?? '',
            tariff_name: doc.tariff_name ?? '',
            hkn_origins: doc.hkn_origins || [],
        });
        setReviewResult(null);
    };

    const closeReview = () => {
        setReviewingDoc(null);
        setReviewFormData({});
        setReviewResult(null);
    };

    const handleReviewSave = async () => {
        if (!reviewingDoc) return;
        setReviewSaving(true);
        setReviewResult(null);

        try {
            const parseNum = (v: any) => (v !== '' && v != null ? parseFloat(v) : null);
            const payload = {
                year: parseInt(reviewFormData.year),
                renewable_percentage: parseNum(reviewFormData.renewable_percentage),
                fossil_percentage: parseNum(reviewFormData.fossil_percentage),
                nuclear_percentage: parseNum(reviewFormData.nuclear_percentage),
                eeg_funded_percentage: parseNum(reviewFormData.eeg_funded_percentage),
                hkn_percentage: parseNum(reviewFormData.hkn_percentage),
                mieterstrom_percentage: parseNum(reviewFormData.mieterstrom_percentage),
                co2_emission_g_kwh: parseNum(reviewFormData.co2_emission_g_kwh),
                radioactive_waste_mg_kwh: parseNum(reviewFormData.radioactive_waste_mg_kwh),
                confidence: parseNum(reviewFormData.confidence),
                tariff_name: reviewFormData.tariff_name || null,
                hkn_origins: reviewFormData.hkn_origins?.length > 0 ? reviewFormData.hkn_origins : null,
                extraction_method: 'manual',
            };

            if (reviewingDoc.mix_id) {
                // Update existing mix entry
                const res = await fetch(`/api/energy-mix/${reviewingDoc.mix_id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) throw new Error((await res.json()).error);
                setReviewResult({ success: true, message: 'Daten aktualisiert' });
            } else {
                // Create new mix entry linked to this document
                const res = await fetch('/api/energy-mix', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...payload,
                        provider_id: provider.id,
                        document_id: reviewingDoc.id || null,
                    }),
                });
                if (!res.ok) throw new Error((await res.json()).error);
                setReviewResult({ success: true, message: 'Neuer Eintrag erstellt' });
            }

            await fetchArchiveData();
            onRefresh();
            setTimeout(() => closeReview(), 1500);
        } catch (err: any) {
            setReviewResult({ success: false, message: err.message });
        } finally {
            setReviewSaving(false);
        }
    };

    // Upload state
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch(`/api/providers/${provider.id}/upload`, {
                method: 'POST',
                body: formData,
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error);
            await fetchArchiveData();
            onRefresh();
        } catch (err: any) {
            alert('Upload fehlgeschlagen: ' + err.message);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDeleteDocument = async (docId: number, filename: string | null) => {
        if (!confirm(`Dokument "${filename || `#${docId}`}" und zugehörige Strommix-Daten wirklich löschen?`)) return;
        try {
            const res = await fetch(`/api/documents/${docId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error((await res.json()).error);
            await fetchArchiveData();
            onRefresh();
        } catch (err: any) {
            alert('Fehler beim Löschen: ' + err.message);
        }
    };

    // Quellen-Wächter: Unbestätigte Quelle bestätigen (Domain wandert in die Whitelist)
    const [confirmingSourceId, setConfirmingSourceId] = useState<number | null>(null);
    const handleConfirmSource = async (mixId: number) => {
        setConfirmingSourceId(mixId);
        try {
            const res = await fetch(`/api/energy-mix/${mixId}/source`, { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            await fetchArchiveData();
            onRefresh();
        } catch (err: any) {
            alert('Fehler beim Bestätigen: ' + err.message);
        } finally {
            setConfirmingSourceId(null);
        }
    };

    const fileTypeLabel: Record<string, string> = {
        pdf: 'PDF',
        image: 'Screenshot',
        html: 'HTML',
    };

    // Analyse-Handler für Review
    const [analyzeLoading, setAnalyzeLoading] = useState<string | null>(null);
    const [analyzeError, setAnalyzeError] = useState<string | null>(null);

    const handleAnalyze = async (method: 'gemini_vision' | 'tesseract_ocr') => {
        if (!reviewingDoc) return;
        setAnalyzeLoading(method);
        setAnalyzeError(null);
        try {
            const res = await fetch(`/api/documents/${reviewingDoc.id}/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ method }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error);

            if (json.success && json.data) {
                setReviewFormData({
                    year: json.data.year || reviewFormData.year,
                    renewable_percentage: json.data.renewable ?? '',
                    fossil_percentage: json.data.fossil ?? '',
                    nuclear_percentage: json.data.nuclear ?? '',
                    eeg_funded_percentage: json.data.eeg_funded ?? '',
                    hkn_percentage: json.data.hkn ?? '',
                    mieterstrom_percentage: json.data.mieterstrom ?? '',
                    co2_emission_g_kwh: json.data.co2 ?? '',
                    radioactive_waste_mg_kwh: json.data.waste ?? '',
                    confidence: json.data.confidence ?? '',
                    tariff_name: json.data.tariff_name ?? '',
                    hkn_origins: json.data.hkn_origins || [],
                });
            } else {
                setAnalyzeError(json.error || 'Keine Daten extrahiert');
            }
        } catch (err: any) {
            setAnalyzeError(err.message);
        } finally {
            setAnalyzeLoading(null);
        }
    };

    // Escape key: closes review first, then modal
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (reviewingDoc) {
                    closeReview();
                } else {
                    onClose();
                }
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose, reviewingDoc]);

    // Focus trap: keep focus inside modal
    useEffect(() => {
        const modal = modalRef.current;
        if (!modal) return;

        // Focus first focusable element on mount
        const focusable = modal.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) focusable[0]?.focus();

        const handleTab = (e: KeyboardEvent) => {
            if (e.key !== 'Tab') return;
            const focusableEls = modal.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            if (focusableEls.length === 0) return;

            const first = focusableEls[0];
            const last = focusableEls[focusableEls.length - 1];

            if (!first || !last) return;

            if (e.shiftKey) {
                if (document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                if (document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };

        document.addEventListener('keydown', handleTab);
        return () => document.removeEventListener('keydown', handleTab);
    }, []);

    return (
        <>
            <div
                className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
                role="dialog"
                aria-modal="true"
                aria-labelledby="provider-modal-title"
                onClick={(e) => {
                    if (e.target === e.currentTarget && !reviewingDoc) onClose();
                }}
            >
                <div
                    ref={modalRef}
                    className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]"
                >
                    {/* Header */}
                    <div className="bg-indigo-900 px-6 py-4 flex justify-between items-center text-white">
                        <div>
                            <h2 id="provider-modal-title" className="text-xl font-bold">
                                {provider.name}
                            </h2>
                            <p className="text-indigo-200 text-sm">
                                ID: {provider.id} • {provider.city || '-'} ({provider.zip || '-'})
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            aria-label="Dialog schließen"
                            className="text-indigo-200 hover:text-white text-2xl font-bold"
                        >
                            &times;
                        </button>
                    </div>

                    <div className="p-6 overflow-y-auto flex-1">
                        {/* Master Data Card */}
                        <div className="mb-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
                            <h3 className="text-sm font-bold text-gray-500 uppercase mb-2">Stammdaten</h3>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="block text-gray-400 text-xs">Adresse</span>
                                    <span className="font-medium text-gray-800">{provider.address || '-'}</span>
                                </div>
                                <div>
                                    <span className="block text-gray-400 text-xs">Stadt / PLZ</span>
                                    <span className="font-medium text-gray-800">
                                        {provider.zip || '-'} {provider.city || '-'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Provider bearbeiten / löschen */}
                        <div className="mb-6 bg-slate-50 p-4 rounded-lg border border-slate-200">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-bold text-slate-700 uppercase">Provider verwalten</h3>
                                <div className="flex gap-2">
                                    {!isEditingProvider && (
                                        <>
                                            <button
                                                onClick={startEditingProvider}
                                                className="px-3 py-1 text-xs font-bold text-indigo-600 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
                                            >
                                                ✏️ Bearbeiten
                                            </button>
                                            <button
                                                onClick={handleDeleteProvider}
                                                className="px-3 py-1 text-xs font-bold text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                                            >
                                                🗑️ Löschen
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>

                            {isEditingProvider ? (
                                <div className="space-y-3">
                                    {/* Name */}
                                    <div>
                                        <label className="block text-xs font-bold text-slate-600 mb-1">Name *</label>
                                        <input
                                            type="text"
                                            value={providerFormData.name}
                                            onChange={(e) =>
                                                setProviderFormData({ ...providerFormData, name: e.target.value })
                                            }
                                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            required
                                        />
                                    </div>

                                    {/* URLs */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 mb-1">URL</label>
                                            <input
                                                type="url"
                                                value={providerFormData.url}
                                                onChange={(e) =>
                                                    setProviderFormData({ ...providerFormData, url: e.target.value })
                                                }
                                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 mb-1">
                                                SKZ-URL
                                            </label>
                                            <input
                                                type="url"
                                                value={providerFormData.skz_url}
                                                onChange={(e) =>
                                                    setProviderFormData({
                                                        ...providerFormData,
                                                        skz_url: e.target.value,
                                                    })
                                                }
                                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                    </div>

                                    {/* Address */}
                                    <div>
                                        <label className="block text-xs font-bold text-slate-600 mb-1">Adresse</label>
                                        <input
                                            type="text"
                                            value={providerFormData.address}
                                            onChange={(e) =>
                                                setProviderFormData({ ...providerFormData, address: e.target.value })
                                            }
                                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>

                                    {/* ZIP + City */}
                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 mb-1">PLZ</label>
                                            <input
                                                type="text"
                                                value={providerFormData.zip}
                                                onChange={(e) =>
                                                    setProviderFormData({ ...providerFormData, zip: e.target.value })
                                                }
                                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                        <div className="col-span-2">
                                            <label className="block text-xs font-bold text-slate-600 mb-1">Stadt</label>
                                            <input
                                                type="text"
                                                value={providerFormData.city}
                                                onChange={(e) =>
                                                    setProviderFormData({ ...providerFormData, city: e.target.value })
                                                }
                                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                    </div>

                                    {/* File Number + Priority */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 mb-1">
                                                Aktenzeichen
                                            </label>
                                            <input
                                                type="text"
                                                value={providerFormData.file_number}
                                                onChange={(e) =>
                                                    setProviderFormData({
                                                        ...providerFormData,
                                                        file_number: e.target.value,
                                                    })
                                                }
                                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                placeholder="12 122/123"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 mb-1">
                                                Priorität (1-100)
                                            </label>
                                            <input
                                                type="number"
                                                value={providerFormData.priority}
                                                onChange={(e) =>
                                                    setProviderFormData({
                                                        ...providerFormData,
                                                        priority: e.target.value,
                                                    })
                                                }
                                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                min={1}
                                                max={100}
                                            />
                                        </div>
                                    </div>

                                    {/* Review Status */}
                                    <div>
                                        <label className="block text-xs font-bold text-slate-600 mb-1">
                                            Prüfstatus
                                        </label>
                                        <select
                                            value={providerFormData.review_status}
                                            onChange={(e) =>
                                                setProviderFormData({
                                                    ...providerFormData,
                                                    review_status: e.target.value,
                                                })
                                            }
                                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                                        >
                                            <option value="offen">Offen</option>
                                            <option value="geprueft">Geprüft</option>
                                            <option value="beanstandet">Beanstandet</option>
                                        </select>
                                    </div>

                                    {/* Result Message */}
                                    {providerResult && (
                                        <div
                                            className={`p-2 rounded text-xs font-medium ${providerResult.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                                        >
                                            {providerResult.success ? '✅ ' : '❌ '} {providerResult.message}
                                        </div>
                                    )}

                                    {/* Actions */}
                                    <div className="flex gap-2 pt-2">
                                        <button
                                            onClick={handleSaveProvider}
                                            disabled={providerSaving}
                                            className={`flex-1 px-4 py-2 text-sm font-bold rounded-lg transition-colors ${providerSaving ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                                        >
                                            {providerSaving ? 'Speichere...' : 'Speichern'}
                                        </button>
                                        <button
                                            onClick={cancelEditingProvider}
                                            className="px-4 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                                        >
                                            Abbrechen
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-xs text-slate-500">
                                    Klicke auf &quot;Bearbeiten&quot;, um Provider-Daten zu ändern, oder auf
                                    &quot;Löschen&quot;, um den Provider zu entfernen.
                                </div>
                            )}
                        </div>

                        {/* Current Energy Mix Status */}
                        <div className="mb-6">
                            <h3 className="text-sm font-bold text-indigo-600 uppercase mb-3">Aktueller Strommix</h3>
                            {provider.last_mix_year ? (
                                <div>
                                    {(() => {
                                        const ee = provider.last_renewable_percentage ?? 0;
                                        const fo = provider.last_fossil_percentage ?? 0;
                                        const nu = provider.last_nuclear_percentage ?? 0;
                                        const sum = ee + fo + nu;
                                        const sumOk = sum >= 95 && sum <= 105;
                                        return (
                                            <>
                                                <div className="grid grid-cols-3 gap-4 mb-3">
                                                    <div className="text-center p-3 bg-green-50 rounded border border-green-100">
                                                        <div className="text-2xl font-bold text-green-700">{ee}%</div>
                                                        <div className="text-xs text-green-600">Erneuerbar</div>
                                                    </div>
                                                    <div className="text-center p-3 bg-gray-50 rounded border border-gray-200">
                                                        <div className="text-2xl font-bold text-gray-700">{fo}%</div>
                                                        <div className="text-xs text-gray-500">Fossil</div>
                                                    </div>
                                                    <div className="text-center p-3 bg-purple-50 rounded border border-purple-100">
                                                        <div className="text-2xl font-bold text-purple-700">{nu}%</div>
                                                        <div className="text-xs text-purple-500">Nuklear</div>
                                                    </div>
                                                </div>
                                                {!sumOk && sum > 0 && (
                                                    <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-amber-800 text-xs">
                                                        &#9888; <strong>Plausibilitätswarnung:</strong> Summe EE+FO+NU ={' '}
                                                        {sum.toFixed(1)}% (erwartet: ~100%)
                                                    </div>
                                                )}
                                                {(() => {
                                                    const bm = BUNDESMIX[provider.last_mix_year] || BUNDESMIX[2023];
                                                    if (!bm) return null;
                                                    const diffEE = ee - bm.ee;
                                                    const diffFO = fo - bm.fossil;
                                                    const diffNU = nu - bm.nuclear;
                                                    const fmt = (v: number) => (v > 0 ? '+' : '') + v.toFixed(1);
                                                    const diffColor = (v: number, invert?: boolean) => {
                                                        const good = invert ? v > 0 : v < 0;
                                                        return Math.abs(v) < 2
                                                            ? 'text-slate-500'
                                                            : good
                                                              ? 'text-red-600'
                                                              : 'text-green-600';
                                                    };
                                                    return (
                                                        <div className="mb-3 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded text-xs">
                                                            <div className="font-bold text-indigo-700 mb-1">
                                                                Vergleich Bundesmix {provider.last_mix_year || 2023}
                                                            </div>
                                                            <div className="flex gap-4">
                                                                <span>
                                                                    EE:{' '}
                                                                    <strong className={diffColor(diffEE)}>
                                                                        {fmt(diffEE)} Pp.
                                                                    </strong>{' '}
                                                                    <span className="text-slate-400">
                                                                        (Bund: {bm.ee}%)
                                                                    </span>
                                                                </span>
                                                                <span>
                                                                    FO:{' '}
                                                                    <strong className={diffColor(diffFO, true)}>
                                                                        {fmt(diffFO)} Pp.
                                                                    </strong>{' '}
                                                                    <span className="text-slate-400">
                                                                        (Bund: {bm.fossil}%)
                                                                    </span>
                                                                </span>
                                                                <span>
                                                                    NU:{' '}
                                                                    <strong className={diffColor(diffNU, true)}>
                                                                        {fmt(diffNU)} Pp.
                                                                    </strong>{' '}
                                                                    <span className="text-slate-400">
                                                                        (Bund: {bm.nuclear}%)
                                                                    </span>
                                                                </span>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
                                            </>
                                        );
                                    })()}
                                    <div className="flex items-center gap-3 text-xs text-gray-400">
                                        <span>Jahr: {provider.last_mix_year}</span>
                                        {provider.last_confidence != null && (
                                            <span
                                                className={`px-1.5 py-0.5 rounded font-bold ${
                                                    provider.last_confidence >= 70
                                                        ? 'text-green-600 bg-green-50'
                                                        : provider.last_confidence >= 40
                                                          ? 'text-yellow-600 bg-yellow-50'
                                                          : 'text-red-600 bg-red-50'
                                                }`}
                                            >
                                                Konfidenz: {provider.last_confidence}%
                                            </span>
                                        )}
                                        {provider.last_extraction_method && (
                                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                                                Methode: {provider.last_extraction_method}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="p-4 bg-yellow-50 text-yellow-800 rounded border border-yellow-200 text-sm">
                                    Noch keine Strommix-Daten extrahiert.
                                    {archiveDocs.length > 0 && (
                                        <span className="block mt-1 text-xs text-yellow-600">
                                            {archiveDocs.length} Dokument(e) vorhanden — Extraktion war nicht
                                            erfolgreich. Prüfe das Dokument im Archiv unten.
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Archive Section */}
                        <div className="mb-6 border-t border-gray-100 pt-6">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-bold text-indigo-600 uppercase">
                                    Archiv
                                    {archiveDocs.length > 0 && (
                                        <span className="ml-2 text-xs font-normal text-gray-400">
                                            ({archiveDocs.length} Dokumente)
                                        </span>
                                    )}
                                </h3>
                                <div className="flex items-center gap-2">
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".pdf,.png,.jpg,.jpeg"
                                        onChange={handleUpload}
                                        className="hidden"
                                    />
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={uploading}
                                        className={`text-xs font-medium border px-3 py-1.5 rounded transition-all flex items-center gap-1 ${
                                            uploading
                                                ? 'text-gray-400 border-gray-200 cursor-wait'
                                                : 'text-indigo-600 hover:text-indigo-800 border-indigo-200 hover:border-indigo-400'
                                        }`}
                                    >
                                        {uploading ? 'Wird hochgeladen...' : 'Hochladen'}
                                    </button>
                                    <button
                                        onClick={startAddingNew}
                                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 px-3 py-1.5 rounded transition-all flex items-center gap-1"
                                    >
                                        + Neuer Eintrag
                                    </button>
                                </div>
                            </div>

                            {/* New Entry Form */}
                            {isAddingNew && (
                                <div className="mb-4 bg-indigo-50 p-4 rounded-lg border border-indigo-200">
                                    <h4 className="text-sm font-bold text-indigo-900 mb-3">
                                        Neuen Strommix-Eintrag hinzufügen
                                    </h4>
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-3 gap-3">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                                    Jahr *
                                                </label>
                                                <input
                                                    type="number"
                                                    value={newEntryFormData.year}
                                                    onChange={(e) =>
                                                        setNewEntryFormData({
                                                            ...newEntryFormData,
                                                            year: e.target.value,
                                                        })
                                                    }
                                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                    min="2000"
                                                    max="2100"
                                                    required
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                                    Erneuerbar %
                                                </label>
                                                <input
                                                    type="number"
                                                    value={newEntryFormData.renewable_percentage}
                                                    onChange={(e) =>
                                                        setNewEntryFormData({
                                                            ...newEntryFormData,
                                                            renewable_percentage: e.target.value,
                                                        })
                                                    }
                                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                    min="0"
                                                    max="100"
                                                    step="0.1"
                                                    placeholder="z.B. 45.5"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                                    Fossil %
                                                </label>
                                                <input
                                                    type="number"
                                                    value={newEntryFormData.fossil_percentage}
                                                    onChange={(e) =>
                                                        setNewEntryFormData({
                                                            ...newEntryFormData,
                                                            fossil_percentage: e.target.value,
                                                        })
                                                    }
                                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                    min="0"
                                                    max="100"
                                                    step="0.1"
                                                    placeholder="z.B. 35.0"
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-3 gap-3">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                                    Nuklear %
                                                </label>
                                                <input
                                                    type="number"
                                                    value={newEntryFormData.nuclear_percentage}
                                                    onChange={(e) =>
                                                        setNewEntryFormData({
                                                            ...newEntryFormData,
                                                            nuclear_percentage: e.target.value,
                                                        })
                                                    }
                                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                    min="0"
                                                    max="100"
                                                    step="0.1"
                                                    placeholder="z.B. 10.0"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                                    CO2 (g/kWh)
                                                </label>
                                                <input
                                                    type="number"
                                                    value={newEntryFormData.co2_emission_g_kwh}
                                                    onChange={(e) =>
                                                        setNewEntryFormData({
                                                            ...newEntryFormData,
                                                            co2_emission_g_kwh: e.target.value,
                                                        })
                                                    }
                                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                    min="0"
                                                    placeholder="z.B. 250"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                                    Tarifname
                                                </label>
                                                <input
                                                    type="text"
                                                    value={newEntryFormData.tariff_name}
                                                    onChange={(e) =>
                                                        setNewEntryFormData({
                                                            ...newEntryFormData,
                                                            tariff_name: e.target.value,
                                                        })
                                                    }
                                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                    placeholder="optional"
                                                />
                                            </div>
                                        </div>

                                        {/* EE-Aufschlüsselung */}
                                        <div className="border-t border-indigo-200/50 pt-3">
                                            <p className="text-[10px] font-bold text-indigo-700 uppercase mb-2">
                                                EE-Aufschlüsselung
                                            </p>
                                            <div className="grid grid-cols-3 gap-3">
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                                        EEG %
                                                    </label>
                                                    <input
                                                        type="number"
                                                        value={newEntryFormData.eeg_funded_percentage || ''}
                                                        onChange={(e) =>
                                                            setNewEntryFormData({
                                                                ...newEntryFormData,
                                                                eeg_funded_percentage: e.target.value,
                                                            })
                                                        }
                                                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                        min="0"
                                                        max="100"
                                                        step="0.1"
                                                        placeholder="z.B. 65.0"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                                        HKN %
                                                    </label>
                                                    <input
                                                        type="number"
                                                        value={newEntryFormData.hkn_percentage || ''}
                                                        onChange={(e) =>
                                                            setNewEntryFormData({
                                                                ...newEntryFormData,
                                                                hkn_percentage: e.target.value,
                                                            })
                                                        }
                                                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                        min="0"
                                                        max="100"
                                                        step="0.1"
                                                        placeholder="z.B. 35.0"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                                        Mieterstrom %
                                                    </label>
                                                    <input
                                                        type="number"
                                                        value={newEntryFormData.mieterstrom_percentage || ''}
                                                        onChange={(e) =>
                                                            setNewEntryFormData({
                                                                ...newEntryFormData,
                                                                mieterstrom_percentage: e.target.value,
                                                            })
                                                        }
                                                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                        min="0"
                                                        max="100"
                                                        step="0.1"
                                                        placeholder="z.B. 0.0"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* HKN-Herkunftsländer Editor */}
                                        <div className="border-t border-indigo-200/50 pt-3">
                                            <div className="flex items-center justify-between mb-2">
                                                <p className="text-[10px] font-bold text-indigo-700 uppercase">
                                                    HKN-Herkunftsländer
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const origins = newEntryFormData.hkn_origins
                                                            ? [...newEntryFormData.hkn_origins]
                                                            : [];
                                                        origins.push({ country: '', percentage: '' });
                                                        setNewEntryFormData({
                                                            ...newEntryFormData,
                                                            hkn_origins: origins,
                                                        });
                                                    }}
                                                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                                                >
                                                    + Land hinzufügen
                                                </button>
                                            </div>
                                            {newEntryFormData.hkn_origins && newEntryFormData.hkn_origins.length > 0 ? (
                                                <div className="space-y-2">
                                                    {newEntryFormData.hkn_origins.map((h: any, i: number) => (
                                                        <div key={i} className="flex items-center gap-2 text-xs">
                                                            <input
                                                                type="text"
                                                                value={h.country}
                                                                onChange={(e) => {
                                                                    const origins = [...newEntryFormData.hkn_origins];
                                                                    origins[i] = {
                                                                        ...origins[i],
                                                                        country: e.target.value,
                                                                    };
                                                                    setNewEntryFormData({
                                                                        ...newEntryFormData,
                                                                        hkn_origins: origins,
                                                                    });
                                                                }}
                                                                className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs"
                                                                placeholder="Land"
                                                            />
                                                            <input
                                                                type="number"
                                                                value={h.percentage}
                                                                onChange={(e) => {
                                                                    const origins = [...newEntryFormData.hkn_origins];
                                                                    origins[i] = {
                                                                        ...origins[i],
                                                                        percentage:
                                                                            e.target.value === ''
                                                                                ? ''
                                                                                : parseFloat(e.target.value),
                                                                    };
                                                                    setNewEntryFormData({
                                                                        ...newEntryFormData,
                                                                        hkn_origins: origins,
                                                                    });
                                                                }}
                                                                className="w-20 px-2 py-1 border border-gray-300 rounded text-xs"
                                                                min="0"
                                                                max="100"
                                                                step="0.1"
                                                                placeholder="%"
                                                            />
                                                            <span className="text-gray-400">%</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const origins = newEntryFormData.hkn_origins.filter(
                                                                        (_: any, j: number) => j !== i
                                                                    );
                                                                    setNewEntryFormData({
                                                                        ...newEntryFormData,
                                                                        hkn_origins: origins,
                                                                    });
                                                                }}
                                                                className="text-red-400 hover:text-red-600 text-xs font-bold px-1"
                                                            >
                                                                ✕
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-xs text-gray-400 italic">
                                                    Keine Herkunftsländer eingetragen.
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2 justify-end pt-2">
                                            {newEntryResult && (
                                                <span
                                                    className={`text-xs font-medium ${newEntryResult.success ? 'text-green-600' : 'text-red-600'}`}
                                                >
                                                    {newEntryResult.message}
                                                </span>
                                            )}
                                            <button
                                                onClick={handleSaveNewEntry}
                                                disabled={newEntryLoading || !newEntryFormData.year}
                                                className={`text-white font-bold text-sm px-4 py-2 rounded ${
                                                    newEntryLoading || !newEntryFormData.year
                                                        ? 'bg-gray-400 cursor-not-allowed'
                                                        : 'bg-green-600 hover:bg-green-700'
                                                }`}
                                            >
                                                {newEntryLoading ? 'Speichern...' : '✓ Speichern'}
                                            </button>
                                            <button
                                                onClick={cancelAddingNew}
                                                disabled={newEntryLoading}
                                                className="text-red-600 hover:text-red-800 font-bold text-sm px-4 py-2 rounded border border-red-200 hover:border-red-400"
                                            >
                                                ✕ Abbrechen
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {archiveLoading ? (
                                <div className="text-sm text-gray-400 py-4 text-center">Lade Archiv...</div>
                            ) : archiveDocs.length === 0 && !isAddingNew ? (
                                <div className="p-4 bg-gray-50 text-gray-500 rounded border border-gray-200 text-sm text-center">
                                    Noch keine archivierten Dokumente vorhanden.
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-gray-200">
                                                <th className="text-left py-2 px-2 text-xs font-bold text-gray-400 uppercase">
                                                    Jahr
                                                </th>
                                                <th className="text-left py-2 px-2 text-xs font-bold text-gray-400 uppercase">
                                                    Typ
                                                </th>
                                                <th className="text-left py-2 px-2 text-xs font-bold text-gray-400 uppercase">
                                                    Strommix
                                                </th>
                                                <th className="text-left py-2 px-2 text-xs font-bold text-gray-400 uppercase">
                                                    Quelle
                                                </th>
                                                <th className="text-right py-2 px-2 text-xs font-bold text-gray-400 uppercase">
                                                    Anzeigen
                                                </th>
                                                <th className="text-right py-2 px-2 text-xs font-bold text-gray-400 uppercase">
                                                    Aktionen
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {archiveDocs.map((doc) =>
                                                editingMixId != null && editingMixId === doc.mix_id ? (
                                                    // Edit Mode
                                                    <tr
                                                        key={`${doc.id}-${doc.mix_id || 'no-mix'}`}
                                                        className="bg-indigo-50"
                                                    >
                                                        <td className="py-2 px-2" colSpan={6}>
                                                            <div className="space-y-3">
                                                                <div className="grid grid-cols-3 gap-3">
                                                                    <div>
                                                                        <label className="block text-xs font-medium text-gray-700 mb-1">
                                                                            Jahr
                                                                        </label>
                                                                        <input
                                                                            type="number"
                                                                            value={editFormData.year}
                                                                            onChange={(e) =>
                                                                                setEditFormData({
                                                                                    ...editFormData,
                                                                                    year: e.target.value,
                                                                                })
                                                                            }
                                                                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                                            min="2000"
                                                                            max="2100"
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-xs font-medium text-gray-700 mb-1">
                                                                            Erneuerbar %
                                                                        </label>
                                                                        <input
                                                                            type="number"
                                                                            value={editFormData.renewable_percentage}
                                                                            onChange={(e) =>
                                                                                setEditFormData({
                                                                                    ...editFormData,
                                                                                    renewable_percentage:
                                                                                        e.target.value,
                                                                                })
                                                                            }
                                                                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                                            min="0"
                                                                            max="100"
                                                                            step="0.1"
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-xs font-medium text-gray-700 mb-1">
                                                                            Fossil %
                                                                        </label>
                                                                        <input
                                                                            type="number"
                                                                            value={editFormData.fossil_percentage}
                                                                            onChange={(e) =>
                                                                                setEditFormData({
                                                                                    ...editFormData,
                                                                                    fossil_percentage: e.target.value,
                                                                                })
                                                                            }
                                                                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                                            min="0"
                                                                            max="100"
                                                                            step="0.1"
                                                                        />
                                                                    </div>
                                                                </div>
                                                                <div className="grid grid-cols-3 gap-3">
                                                                    <div>
                                                                        <label className="block text-xs font-medium text-gray-700 mb-1">
                                                                            Nuklear %
                                                                        </label>
                                                                        <input
                                                                            type="number"
                                                                            value={editFormData.nuclear_percentage}
                                                                            onChange={(e) =>
                                                                                setEditFormData({
                                                                                    ...editFormData,
                                                                                    nuclear_percentage: e.target.value,
                                                                                })
                                                                            }
                                                                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                                            min="0"
                                                                            max="100"
                                                                            step="0.1"
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-xs font-medium text-gray-700 mb-1">
                                                                            CO2 (g/kWh)
                                                                        </label>
                                                                        <input
                                                                            type="number"
                                                                            value={editFormData.co2_emission_g_kwh}
                                                                            onChange={(e) =>
                                                                                setEditFormData({
                                                                                    ...editFormData,
                                                                                    co2_emission_g_kwh: e.target.value,
                                                                                })
                                                                            }
                                                                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                                            min="0"
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-xs font-medium text-gray-700 mb-1">
                                                                            Konfidenz %
                                                                        </label>
                                                                        <input
                                                                            type="number"
                                                                            value={editFormData.confidence}
                                                                            onChange={(e) =>
                                                                                setEditFormData({
                                                                                    ...editFormData,
                                                                                    confidence: e.target.value,
                                                                                })
                                                                            }
                                                                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                                            min="0"
                                                                            max="100"
                                                                        />
                                                                    </div>
                                                                </div>

                                                                {/* EE-Aufschlüsselung */}
                                                                <div className="border-t border-indigo-200/50 pt-3">
                                                                    <p className="text-[10px] font-bold text-indigo-700 uppercase mb-2">
                                                                        EE-Aufschlüsselung
                                                                    </p>
                                                                    <div className="grid grid-cols-3 gap-3">
                                                                        <div>
                                                                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                                                                EEG %
                                                                            </label>
                                                                            <input
                                                                                type="number"
                                                                                value={
                                                                                    editFormData.eeg_funded_percentage ||
                                                                                    ''
                                                                                }
                                                                                onChange={(e) =>
                                                                                    setEditFormData({
                                                                                        ...editFormData,
                                                                                        eeg_funded_percentage:
                                                                                            e.target.value,
                                                                                    })
                                                                                }
                                                                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                                                min="0"
                                                                                max="100"
                                                                                step="0.1"
                                                                            />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                                                                HKN %
                                                                            </label>
                                                                            <input
                                                                                type="number"
                                                                                value={
                                                                                    editFormData.hkn_percentage || ''
                                                                                }
                                                                                onChange={(e) =>
                                                                                    setEditFormData({
                                                                                        ...editFormData,
                                                                                        hkn_percentage: e.target.value,
                                                                                    })
                                                                                }
                                                                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                                                min="0"
                                                                                max="100"
                                                                                step="0.1"
                                                                            />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                                                                Mieterstrom %
                                                                            </label>
                                                                            <input
                                                                                type="number"
                                                                                value={
                                                                                    editFormData.mieterstrom_percentage ||
                                                                                    ''
                                                                                }
                                                                                onChange={(e) =>
                                                                                    setEditFormData({
                                                                                        ...editFormData,
                                                                                        mieterstrom_percentage:
                                                                                            e.target.value,
                                                                                    })
                                                                                }
                                                                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                                                min="0"
                                                                                max="100"
                                                                                step="0.1"
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* HKN-Herkunftsländer Editor */}
                                                                <div className="border-t border-indigo-200/50 pt-3">
                                                                    <div className="flex items-center justify-between mb-2">
                                                                        <p className="text-[10px] font-bold text-indigo-700 uppercase">
                                                                            HKN-Herkunftsländer
                                                                        </p>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                const origins = editFormData.hkn_origins
                                                                                    ? [...editFormData.hkn_origins]
                                                                                    : [];
                                                                                origins.push({
                                                                                    country: '',
                                                                                    percentage: '',
                                                                                });
                                                                                setEditFormData({
                                                                                    ...editFormData,
                                                                                    hkn_origins: origins,
                                                                                });
                                                                            }}
                                                                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                                                                        >
                                                                            + Land hinzufügen
                                                                        </button>
                                                                    </div>
                                                                    {editFormData.hkn_origins &&
                                                                    editFormData.hkn_origins.length > 0 ? (
                                                                        <div className="space-y-2">
                                                                            {editFormData.hkn_origins.map(
                                                                                (h: any, i: number) => (
                                                                                    <div
                                                                                        key={i}
                                                                                        className="flex items-center gap-2 text-xs"
                                                                                    >
                                                                                        <input
                                                                                            type="text"
                                                                                            value={h.country}
                                                                                            onChange={(e) => {
                                                                                                const origins = [
                                                                                                    ...editFormData.hkn_origins,
                                                                                                ];
                                                                                                origins[i] = {
                                                                                                    ...origins[i],
                                                                                                    country:
                                                                                                        e.target.value,
                                                                                                };
                                                                                                setEditFormData({
                                                                                                    ...editFormData,
                                                                                                    hkn_origins:
                                                                                                        origins,
                                                                                                });
                                                                                            }}
                                                                                            className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs"
                                                                                            placeholder="Land"
                                                                                        />
                                                                                        <input
                                                                                            type="number"
                                                                                            value={h.percentage}
                                                                                            onChange={(e) => {
                                                                                                const origins = [
                                                                                                    ...editFormData.hkn_origins,
                                                                                                ];
                                                                                                origins[i] = {
                                                                                                    ...origins[i],
                                                                                                    percentage:
                                                                                                        e.target
                                                                                                            .value ===
                                                                                                        ''
                                                                                                            ? ''
                                                                                                            : parseFloat(
                                                                                                                  e
                                                                                                                      .target
                                                                                                                      .value
                                                                                                              ),
                                                                                                };
                                                                                                setEditFormData({
                                                                                                    ...editFormData,
                                                                                                    hkn_origins:
                                                                                                        origins,
                                                                                                });
                                                                                            }}
                                                                                            className="w-20 px-2 py-1 border border-gray-300 rounded text-xs"
                                                                                            min="0"
                                                                                            max="100"
                                                                                            step="0.1"
                                                                                            placeholder="%"
                                                                                        />
                                                                                        <span className="text-gray-400">
                                                                                            %
                                                                                        </span>
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => {
                                                                                                const origins =
                                                                                                    editFormData.hkn_origins.filter(
                                                                                                        (
                                                                                                            _: any,
                                                                                                            j: number
                                                                                                        ) => j !== i
                                                                                                    );
                                                                                                setEditFormData({
                                                                                                    ...editFormData,
                                                                                                    hkn_origins:
                                                                                                        origins,
                                                                                                });
                                                                                            }}
                                                                                            className="text-red-400 hover:text-red-600 text-xs font-bold px-1"
                                                                                        >
                                                                                            ✕
                                                                                        </button>
                                                                                    </div>
                                                                                )
                                                                            )}
                                                                        </div>
                                                                    ) : (
                                                                        <p className="text-xs text-gray-400 italic">
                                                                            Keine Herkunftsländer eingetragen.
                                                                        </p>
                                                                    )}
                                                                </div>

                                                                <div className="flex items-center gap-2 justify-end">
                                                                    {editResult && (
                                                                        <span
                                                                            className={`text-xs font-medium ${editResult.success ? 'text-green-600' : 'text-red-600'}`}
                                                                        >
                                                                            {editResult.message}
                                                                        </span>
                                                                    )}
                                                                    <button
                                                                        onClick={handleSaveMix}
                                                                        disabled={editLoading}
                                                                        className={`text-green-600 hover:text-green-800 font-bold text-sm px-3 py-1 rounded border border-green-200 hover:border-green-400 ${editLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                    >
                                                                        ✓ Speichern
                                                                    </button>
                                                                    <button
                                                                        onClick={cancelEditingMix}
                                                                        className="text-red-600 hover:text-red-800 font-bold text-sm px-3 py-1 rounded border border-red-200 hover:border-red-400"
                                                                    >
                                                                        ✕ Abbrechen
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    // Display Mode
                                                    <tr
                                                        key={`${doc.id}-${doc.mix_id || 'no-mix'}`}
                                                        className="hover:bg-gray-50"
                                                    >
                                                        <td className="py-2 px-2 font-medium text-gray-800">
                                                            {doc.reporting_year || doc.mix_year || '-'}
                                                        </td>
                                                        <td className="py-2 px-2">
                                                            <span
                                                                className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                                                                    doc.file_type === 'pdf'
                                                                        ? 'bg-red-50 text-red-600'
                                                                        : doc.file_type === 'image'
                                                                          ? 'bg-blue-50 text-blue-600'
                                                                          : 'bg-gray-50 text-gray-600'
                                                                }`}
                                                            >
                                                                {fileTypeLabel[doc.file_type] || doc.file_type}
                                                            </span>
                                                        </td>
                                                        <td className="py-2 px-2">
                                                            {doc.renewable_percentage != null ? (
                                                                (() => {
                                                                    const mixSum =
                                                                        (doc.renewable_percentage ?? 0) +
                                                                        (doc.fossil_percentage ?? 0) +
                                                                        (doc.nuclear_percentage ?? 0);
                                                                    const mixSumOk = mixSum >= 95 && mixSum <= 105;
                                                                    const hasEeBreakdown =
                                                                        doc.eeg_funded_percentage != null ||
                                                                        doc.hkn_percentage != null ||
                                                                        doc.mieterstrom_percentage != null;
                                                                    return (
                                                                        <div>
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="font-bold text-green-700">
                                                                                    {doc.renewable_percentage}%
                                                                                </span>
                                                                                <span className="text-gray-400 text-xs">
                                                                                    EE
                                                                                </span>
                                                                                {doc.mix_type &&
                                                                                    doc.mix_type !== 'unbekannt' && (
                                                                                        <span className="text-[10px] px-1 py-0.5 rounded bg-indigo-50 text-indigo-600 font-medium">
                                                                                            {doc.mix_type}
                                                                                        </span>
                                                                                    )}
                                                                                {!mixSumOk && mixSum > 0 && (
                                                                                    <span
                                                                                        title={`Summe: ${mixSum.toFixed(1)}%`}
                                                                                        className="text-amber-500 cursor-help text-xs"
                                                                                    >
                                                                                        &#9888;
                                                                                    </span>
                                                                                )}
                                                                                {doc.confidence != null && (
                                                                                    <span
                                                                                        className={`text-[10px] px-1 py-0.5 rounded font-bold ${
                                                                                            doc.confidence >= 70
                                                                                                ? 'text-green-600 bg-green-50'
                                                                                                : doc.confidence >= 40
                                                                                                  ? 'text-yellow-600 bg-yellow-50'
                                                                                                  : 'text-red-600 bg-red-50'
                                                                                        }`}
                                                                                    >
                                                                                        {doc.confidence}%
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            {hasEeBreakdown && (
                                                                                <div className="mt-0.5 text-[10px] text-gray-500 space-x-2">
                                                                                    {doc.eeg_funded_percentage !=
                                                                                        null && (
                                                                                        <span>
                                                                                            EEG:{' '}
                                                                                            {doc.eeg_funded_percentage}%
                                                                                        </span>
                                                                                    )}
                                                                                    {doc.hkn_percentage != null && (
                                                                                        <span>
                                                                                            HKN: {doc.hkn_percentage}%
                                                                                        </span>
                                                                                    )}
                                                                                    {doc.mieterstrom_percentage !=
                                                                                        null && (
                                                                                        <span>
                                                                                            Mieter:{' '}
                                                                                            {doc.mieterstrom_percentage}
                                                                                            %
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            )}
                                                                            {doc.hkn_origins &&
                                                                                doc.hkn_origins.length > 0 && (
                                                                                    <div className="mt-0.5 text-[10px] text-gray-400">
                                                                                        HKN:{' '}
                                                                                        {doc.hkn_origins
                                                                                            .map(
                                                                                                (h) =>
                                                                                                    `${h.country} ${h.percentage}%`
                                                                                            )
                                                                                            .join(', ')}
                                                                                    </div>
                                                                                )}
                                                                        </div>
                                                                    );
                                                                })()
                                                            ) : (
                                                                <span className="text-gray-300">-</span>
                                                            )}
                                                        </td>
                                                        <td className="py-2 px-2 max-w-[180px]">
                                                            {doc.source_url ? (
                                                                <a
                                                                    href={doc.source_url}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-indigo-500 hover:text-indigo-700 text-xs truncate block"
                                                                    title={doc.source_url}
                                                                >
                                                                    {(() => {
                                                                        try {
                                                                            return new URL(doc.source_url).hostname;
                                                                        } catch {
                                                                            return doc.source_url;
                                                                        }
                                                                    })()}
                                                                </a>
                                                            ) : (
                                                                <span className="text-gray-300 text-xs">-</span>
                                                            )}
                                                            {doc.source_status === 'unbestaetigt' && (
                                                                <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                                                    <span
                                                                        className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-bold"
                                                                        title="Die Quelle passt nicht zum Anbieternamen — Dokument öffnen und prüfen, ob es wirklich zu diesem Anbieter gehört!"
                                                                    >
                                                                        ⚠ Quelle prüfen
                                                                    </span>
                                                                    {doc.mix_id != null && (
                                                                        <button
                                                                            onClick={() =>
                                                                                handleConfirmSource(doc.mix_id!)
                                                                            }
                                                                            disabled={confirmingSourceId === doc.mix_id}
                                                                            className="text-[10px] px-1.5 py-0.5 rounded bg-green-600 hover:bg-green-700 text-white font-bold disabled:opacity-50"
                                                                            title="Quelle gehört zum Anbieter — Domain dauerhaft als vertrauenswürdig markieren"
                                                                        >
                                                                            {confirmingSourceId === doc.mix_id
                                                                                ? '...'
                                                                                : '✓ Bestätigen'}
                                                                        </button>
                                                                    )}
                                                                    {doc.id != null && (
                                                                        <button
                                                                            onClick={() =>
                                                                                handleDeleteDocument(
                                                                                    doc.id,
                                                                                    doc.original_filename
                                                                                )
                                                                            }
                                                                            className="text-[10px] px-1.5 py-0.5 rounded bg-red-600 hover:bg-red-700 text-white font-bold"
                                                                            title="Fremdes Dokument — Dokument, Daten und Datei löschen"
                                                                        >
                                                                            ✕ Verwerfen
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            )}
                                                            {doc.source_status === 'bestaetigt' && (
                                                                <span
                                                                    className="mt-1 inline-block text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-medium"
                                                                    title="Quelle wurde manuell bestätigt"
                                                                >
                                                                    ✓ Quelle bestätigt
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="py-2 px-2 text-right">
                                                            {doc.id ? (
                                                                <div className="flex items-center justify-end gap-1">
                                                                    <button
                                                                        onClick={() => startReview(doc)}
                                                                        className="inline-flex items-center gap-1 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded shadow-sm transition-all"
                                                                        title="Dokument prüfen und Werte korrigieren"
                                                                    >
                                                                        Review
                                                                    </button>
                                                                    <a
                                                                        href={`/api/documents/${doc.id}/file`}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="inline-flex items-center text-xs text-gray-400 hover:text-indigo-600 px-1.5 py-1.5"
                                                                        title="In neuem Tab öffnen"
                                                                    >
                                                                        ↗
                                                                    </a>
                                                                    <button
                                                                        onClick={() =>
                                                                            handleDeleteDocument(
                                                                                doc.id,
                                                                                doc.original_filename
                                                                            )
                                                                        }
                                                                        className="inline-flex items-center text-xs text-gray-400 hover:text-red-600 px-1.5 py-1.5"
                                                                        title="Dokument und Strommix-Daten löschen"
                                                                    >
                                                                        🗑️
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <span className="text-xs text-gray-400 italic">
                                                                    Manuell
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="py-2 px-2 text-right">
                                                            <div className="flex items-center justify-end gap-2">
                                                                {doc.mix_id && (
                                                                    <>
                                                                        <button
                                                                            onClick={() => startEditingMix(doc)}
                                                                            className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                                                                            title="Bearbeiten"
                                                                        >
                                                                            ✏️
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleDeleteMix(doc.mix_id!)}
                                                                            className="text-xs font-medium text-red-600 hover:text-red-800"
                                                                            title="Löschen"
                                                                        >
                                                                            🗑️
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="border-t border-gray-100 pt-6">
                            <h3 className="text-sm font-bold text-gray-800 mb-3">Scraper manuell starten</h3>

                            {provider.latest_job_status === 'failed' && (
                                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                                    <div className="flex items-start gap-2">
                                        <span className="text-red-500 text-sm">⚠</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs font-bold text-red-700 mb-0.5">
                                                Letzter Scrape fehlgeschlagen
                                            </div>
                                            {provider.latest_job_log && (
                                                <div className="text-xs text-red-600 break-words">
                                                    {provider.latest_job_log}
                                                </div>
                                            )}
                                            <div className="text-xs text-slate-500 mt-1.5">
                                                💡 Tipp: Stromkennzeichnungs-Seite des Anbieters manuell suchen, die URL
                                                unten eintragen und direkt scrapen — sie wird beim Speichern als skz_url
                                                für künftige Läufe hinterlegt.
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="mb-4">
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Direkte URL zur Stromkennzeichnung (optional)
                                </label>
                                <input
                                    type="url"
                                    placeholder="https://www.provider.de/stromkennzeichnung.pdf"
                                    className="w-full border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 text-sm p-2 border"
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                />
                                <p className="text-xs text-gray-400 mt-1">
                                    Leer lassen für automatische DuckDuckGo-Suche.
                                </p>
                            </div>

                            <div className="flex items-center justify-between">
                                <div>
                                    {result && (
                                        <span
                                            className={`text-sm font-medium ${result.success ? 'text-green-600' : 'text-red-600'}`}
                                        >
                                            {result.message}
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={handleScrape}
                                    disabled={loading}
                                    className={`px-6 py-2 rounded-lg font-bold text-white shadow transition-colors
                            ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}
                        `}
                                >
                                    {loading ? 'Wird gestartet...' : 'Scraper jetzt starten'}
                                </button>
                            </div>
                        </div>

                        {/* Notizen / Aktenvermerke */}
                        <div className="border-t border-gray-100 pt-6">
                            <button
                                onClick={() => setNotesExpanded(!notesExpanded)}
                                className="flex items-center gap-2 text-sm font-bold text-gray-800 mb-3 hover:text-indigo-600"
                            >
                                <span>{notesExpanded ? '▼' : '▶'}</span>
                                Notizen / Aktenvermerke ({notes.length})
                            </button>
                            {notesExpanded && (
                                <div className="space-y-3">
                                    {/* Neue Notiz */}
                                    <div className="flex gap-2">
                                        <textarea
                                            value={newNoteText}
                                            onChange={(e) => setNewNoteText(e.target.value)}
                                            placeholder="Neue Notiz eingeben..."
                                            rows={2}
                                            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                                        />
                                        <button
                                            onClick={handleSaveNote}
                                            disabled={noteSaving || !newNoteText.trim()}
                                            className={`self-end px-4 py-2 text-sm font-bold rounded-lg transition-colors ${
                                                noteSaving || !newNoteText.trim()
                                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                            }`}
                                        >
                                            {noteSaving ? '...' : 'Speichern'}
                                        </button>
                                    </div>
                                    {/* Vorhandene Notizen */}
                                    {notes.length === 0 ? (
                                        <p className="text-xs text-gray-400 italic">Noch keine Notizen vorhanden.</p>
                                    ) : (
                                        <div className="space-y-2 max-h-48 overflow-y-auto">
                                            {notes.map((note) => (
                                                <div
                                                    key={note.id}
                                                    className="flex items-start gap-2 text-xs bg-amber-50 border border-amber-100 rounded-lg px-3 py-2"
                                                >
                                                    <span className="flex-1 text-gray-700 whitespace-pre-wrap">
                                                        {note.text}
                                                    </span>
                                                    <div className="shrink-0 flex flex-col items-end gap-1">
                                                        <span className="text-gray-400" suppressHydrationWarning>
                                                            {formatModalDate(note.created_at)}
                                                        </span>
                                                        <button
                                                            onClick={() => handleDeleteNote(note.id)}
                                                            className="text-red-400 hover:text-red-600"
                                                            title="Notiz löschen"
                                                        >
                                                            🗑️
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Audit Trail */}
                        {auditLog.length > 0 && (
                            <div className="border-t border-gray-100 pt-6">
                                <button
                                    onClick={() => setAuditExpanded(!auditExpanded)}
                                    className="flex items-center gap-2 text-sm font-bold text-gray-800 mb-3 hover:text-indigo-600"
                                >
                                    <span>{auditExpanded ? '▼' : '▶'}</span>
                                    Änderungshistorie ({auditLog.length})
                                </button>
                                {auditExpanded && (
                                    <div className="space-y-2 max-h-48 overflow-y-auto">
                                        {auditLog.map((entry: any) => (
                                            <div
                                                key={entry.id}
                                                className="flex items-start gap-3 text-xs border-l-2 border-indigo-200 pl-3 py-1"
                                            >
                                                <span
                                                    className={`shrink-0 px-1.5 py-0.5 rounded font-bold ${
                                                        entry.action === 'create'
                                                            ? 'bg-green-50 text-green-700'
                                                            : entry.action === 'update'
                                                              ? 'bg-blue-50 text-blue-700'
                                                              : entry.action === 'delete'
                                                                ? 'bg-red-50 text-red-700'
                                                                : entry.action === 'review_change'
                                                                  ? 'bg-purple-50 text-purple-700'
                                                                  : 'bg-slate-50 text-slate-600'
                                                    }`}
                                                >
                                                    {entry.action === 'create'
                                                        ? 'Neu'
                                                        : entry.action === 'update'
                                                          ? 'Bearbeitet'
                                                          : entry.action === 'delete'
                                                            ? 'Gelöscht'
                                                            : entry.action === 'review_change'
                                                              ? 'Prüfung'
                                                              : entry.action}
                                                </span>
                                                <span className="text-gray-600 flex-1">{entry.description}</span>
                                                <span className="text-gray-400 shrink-0" suppressHydrationWarning>
                                                    {formatModalDate(entry.created_at)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Fullscreen Review Overlay */}
            {reviewingDoc && (
                <div className="fixed inset-0 bg-gray-900 z-[60] flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between bg-indigo-700 text-white px-6 py-3 shrink-0">
                        <div className="flex items-center gap-3">
                            <h3 className="text-base font-bold truncate max-w-xl">
                                {reviewingDoc.original_filename || `Dokument #${reviewingDoc.id}`}
                            </h3>
                            <span
                                className={`px-2 py-0.5 rounded text-xs font-bold ${
                                    reviewingDoc.file_type === 'pdf' ? 'bg-red-500/30' : 'bg-blue-500/30'
                                }`}
                            >
                                {fileTypeLabel[reviewingDoc.file_type] || reviewingDoc.file_type}
                            </span>
                            {reviewingDoc.extraction_method && (
                                <span className="px-2 py-0.5 rounded text-xs bg-white/10">
                                    Methode: {reviewingDoc.extraction_method}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <a
                                href={`/api/documents/${reviewingDoc.id}/file`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-indigo-200 hover:text-white text-xs px-2 py-1 border border-indigo-400 rounded"
                            >
                                In neuem Tab
                            </a>
                            <button
                                onClick={closeReview}
                                className="text-indigo-200 hover:text-white text-2xl font-bold leading-none"
                            >
                                &times;
                            </button>
                        </div>
                    </div>

                    {/* Split view: Document (70%) + Form (30%) */}
                    <div className="flex flex-1 overflow-hidden">
                        {/* Left: Document viewer */}
                        <div className="flex-[7] bg-gray-800 overflow-auto">
                            {reviewingDoc.file_type === 'pdf' ? (
                                <iframe
                                    src={`/api/documents/${reviewingDoc.id}/file`}
                                    className="w-full h-full"
                                    title="PDF-Dokument"
                                />
                            ) : (
                                <div className="flex items-center justify-center h-full p-4">
                                    <img
                                        src={`/api/documents/${reviewingDoc.id}/file`}
                                        alt="Dokument"
                                        className="max-w-full max-h-full object-contain"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Right: Form panel */}
                        <div className="flex-[3] bg-white border-l border-gray-200 overflow-y-auto p-5 space-y-4">
                            {/* Auto-analyze buttons */}
                            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 space-y-2">
                                <p className="text-xs font-bold text-indigo-700 uppercase">Automatisch analysieren</p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleAnalyze('gemini_vision')}
                                        disabled={analyzeLoading !== null}
                                        className={`flex-1 text-xs font-medium px-3 py-2 rounded border transition-colors ${
                                            analyzeLoading === 'gemini_vision'
                                                ? 'bg-indigo-100 text-indigo-400 border-indigo-200 cursor-wait'
                                                : analyzeLoading !== null
                                                  ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                                  : 'bg-white text-indigo-700 border-indigo-300 hover:bg-indigo-50'
                                        }`}
                                    >
                                        {analyzeLoading === 'gemini_vision' ? 'Analysiere...' : 'Gemini Vision'}
                                    </button>
                                    <button
                                        onClick={() => handleAnalyze('tesseract_ocr')}
                                        disabled={analyzeLoading !== null || reviewingDoc.file_type === 'pdf'}
                                        className={`flex-1 text-xs font-medium px-3 py-2 rounded border transition-colors ${
                                            analyzeLoading === 'tesseract_ocr'
                                                ? 'bg-indigo-100 text-indigo-400 border-indigo-200 cursor-wait'
                                                : analyzeLoading !== null || reviewingDoc.file_type === 'pdf'
                                                  ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                                  : 'bg-white text-indigo-700 border-indigo-300 hover:bg-indigo-50'
                                        }`}
                                        title={reviewingDoc.file_type === 'pdf' ? 'OCR nur für Bilder verfügbar' : ''}
                                    >
                                        {analyzeLoading === 'tesseract_ocr' ? 'OCR läuft...' : 'Tesseract OCR'}
                                    </button>
                                </div>
                                {analyzeError && (
                                    <p className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">{analyzeError}</p>
                                )}
                            </div>

                            {/* Form */}
                            <p className="text-xs text-indigo-700 font-medium">
                                {reviewingDoc.mix_id
                                    ? 'Vorhandene Werte bearbeiten:'
                                    : 'Neue Werte aus Dokument erfassen:'}
                            </p>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Jahr *</label>
                                <input
                                    type="number"
                                    value={reviewFormData.year}
                                    onChange={(e) => setReviewFormData({ ...reviewFormData, year: e.target.value })}
                                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    min="2000"
                                    max="2100"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Erneuerbar %</label>
                                    <input
                                        type="number"
                                        value={reviewFormData.renewable_percentage}
                                        onChange={(e) =>
                                            setReviewFormData({
                                                ...reviewFormData,
                                                renewable_percentage: e.target.value,
                                            })
                                        }
                                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        min="0"
                                        max="100"
                                        step="0.1"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Fossil %</label>
                                    <input
                                        type="number"
                                        value={reviewFormData.fossil_percentage}
                                        onChange={(e) =>
                                            setReviewFormData({ ...reviewFormData, fossil_percentage: e.target.value })
                                        }
                                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        min="0"
                                        max="100"
                                        step="0.1"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Nuklear %</label>
                                    <input
                                        type="number"
                                        value={reviewFormData.nuclear_percentage}
                                        onChange={(e) =>
                                            setReviewFormData({ ...reviewFormData, nuclear_percentage: e.target.value })
                                        }
                                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        min="0"
                                        max="100"
                                        step="0.1"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">CO2 g/kWh</label>
                                    <input
                                        type="number"
                                        value={reviewFormData.co2_emission_g_kwh}
                                        onChange={(e) =>
                                            setReviewFormData({ ...reviewFormData, co2_emission_g_kwh: e.target.value })
                                        }
                                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        min="0"
                                    />
                                </div>
                            </div>

                            {/* EE-Aufschlüsselung */}
                            <div className="border-t border-gray-100 pt-3">
                                <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">EE-Aufschlüsselung</p>
                                <div className="grid grid-cols-3 gap-2">
                                    <div>
                                        <label className="block text-[10px] text-gray-500 mb-0.5">EEG %</label>
                                        <input
                                            type="number"
                                            value={reviewFormData.eeg_funded_percentage}
                                            onChange={(e) =>
                                                setReviewFormData({
                                                    ...reviewFormData,
                                                    eeg_funded_percentage: e.target.value,
                                                })
                                            }
                                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            min="0"
                                            max="100"
                                            step="0.1"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-gray-500 mb-0.5">HKN %</label>
                                        <input
                                            type="number"
                                            value={reviewFormData.hkn_percentage}
                                            onChange={(e) =>
                                                setReviewFormData({ ...reviewFormData, hkn_percentage: e.target.value })
                                            }
                                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            min="0"
                                            max="100"
                                            step="0.1"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-gray-500 mb-0.5">Mieter %</label>
                                        <input
                                            type="number"
                                            value={reviewFormData.mieterstrom_percentage}
                                            onChange={(e) =>
                                                setReviewFormData({
                                                    ...reviewFormData,
                                                    mieterstrom_percentage: e.target.value,
                                                })
                                            }
                                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            min="0"
                                            max="100"
                                            step="0.1"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Radioaktiver Abfall + Konfidenz */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                        Radioaktiv mg/kWh
                                    </label>
                                    <input
                                        type="number"
                                        value={reviewFormData.radioactive_waste_mg_kwh}
                                        onChange={(e) =>
                                            setReviewFormData({
                                                ...reviewFormData,
                                                radioactive_waste_mg_kwh: e.target.value,
                                            })
                                        }
                                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        min="0"
                                        step="0.0001"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Konfidenz %</label>
                                    <input
                                        type="number"
                                        value={reviewFormData.confidence}
                                        onChange={(e) =>
                                            setReviewFormData({ ...reviewFormData, confidence: e.target.value })
                                        }
                                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        min="0"
                                        max="100"
                                    />
                                </div>
                            </div>

                            {/* HKN-Herkunftsländer */}
                            <div className="border-t border-gray-100 pt-3">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase">HKN-Herkunftsländer</p>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const origins = reviewFormData.hkn_origins
                                                ? [...reviewFormData.hkn_origins]
                                                : [];
                                            origins.push({ country: '', percentage: '' });
                                            setReviewFormData({ ...reviewFormData, hkn_origins: origins });
                                        }}
                                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                                    >
                                        + Land hinzufügen
                                    </button>
                                </div>
                                {reviewFormData.hkn_origins && reviewFormData.hkn_origins.length > 0 ? (
                                    <div className="space-y-1">
                                        {reviewFormData.hkn_origins.map((h: HknOrigin, i: number) => (
                                            <div key={i} className="flex items-center gap-2 text-xs">
                                                <input
                                                    type="text"
                                                    value={h.country}
                                                    onChange={(e) => {
                                                        const origins = [...reviewFormData.hkn_origins];
                                                        origins[i] = { ...origins[i], country: e.target.value };
                                                        setReviewFormData({ ...reviewFormData, hkn_origins: origins });
                                                    }}
                                                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs"
                                                    placeholder="Land"
                                                />
                                                <input
                                                    type="number"
                                                    value={h.percentage}
                                                    onChange={(e) => {
                                                        const origins = [...reviewFormData.hkn_origins];
                                                        origins[i] = {
                                                            ...origins[i],
                                                            percentage:
                                                                e.target.value === ''
                                                                    ? ''
                                                                    : parseFloat(e.target.value) || 0,
                                                        };
                                                        setReviewFormData({ ...reviewFormData, hkn_origins: origins });
                                                    }}
                                                    className="w-20 px-2 py-1 border border-gray-300 rounded text-xs"
                                                    min="0"
                                                    max="100"
                                                    step="0.1"
                                                    placeholder="%"
                                                />
                                                <span className="text-gray-400">%</span>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const origins = reviewFormData.hkn_origins.filter(
                                                            (_: HknOrigin, j: number) => j !== i
                                                        );
                                                        setReviewFormData({ ...reviewFormData, hkn_origins: origins });
                                                    }}
                                                    className="text-red-400 hover:text-red-600 text-xs font-bold px-1"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-400 italic">Keine Herkunftsländer eingetragen.</p>
                                )}
                            </div>

                            {/* Sum check */}
                            {(() => {
                                const ee = parseFloat(reviewFormData.renewable_percentage) || 0;
                                const fo = parseFloat(reviewFormData.fossil_percentage) || 0;
                                const nu = parseFloat(reviewFormData.nuclear_percentage) || 0;
                                const sum = ee + fo + nu;
                                const ok = sum >= 95 && sum <= 105;
                                return sum > 0 ? (
                                    <div
                                        className={`text-xs px-2 py-1.5 rounded font-medium ${ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}
                                    >
                                        Summe: {sum.toFixed(1)}% {ok ? '' : '(erwartet ~100%)'}
                                    </div>
                                ) : null;
                            })()}

                            {/* Save / Cancel */}
                            <div className="flex gap-2 pt-2">
                                <button
                                    onClick={handleReviewSave}
                                    disabled={reviewSaving}
                                    className={`flex-1 text-white font-bold text-sm px-4 py-2.5 rounded transition-colors ${
                                        reviewSaving
                                            ? 'bg-gray-400 cursor-not-allowed'
                                            : 'bg-green-600 hover:bg-green-700'
                                    }`}
                                >
                                    {reviewSaving
                                        ? 'Speichern...'
                                        : reviewingDoc.mix_id
                                          ? 'Aktualisieren'
                                          : 'Eintrag erstellen'}
                                </button>
                                <button
                                    onClick={closeReview}
                                    className="text-gray-600 hover:text-gray-800 font-bold text-sm px-4 py-2.5 rounded border border-gray-300 hover:border-gray-400"
                                >
                                    Abbrechen
                                </button>
                            </div>
                            {reviewResult && (
                                <div
                                    className={`text-xs font-medium px-3 py-2 rounded ${reviewResult.success ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}
                                >
                                    {reviewResult.message}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
