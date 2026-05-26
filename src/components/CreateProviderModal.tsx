'use client';

import { useState, useRef, useEffect } from 'react';

interface CreateProviderModalProps {
    onClose: () => void;
    onSuccess: () => void;
}

export default function CreateProviderModal({ onClose, onSuccess }: CreateProviderModalProps) {
    const [formData, setFormData] = useState({
        name: '',
        url: '',
        skz_url: '',
        address: '',
        zip: '',
        city: '',
        file_number: '',
        priority: '',
        review_status: 'offen',
    });
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
    const modalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
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
    }, [onClose]);

    useEffect(() => {
        const firstInput = modalRef.current?.querySelector('input');
        firstInput?.focus();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setResult(null);

        try {
            const payload: any = {
                name: formData.name.trim(),
                url: formData.url.trim() || null,
                skz_url: formData.skz_url.trim() || null,
                address: formData.address.trim() || null,
                zip: formData.zip.trim() || null,
                city: formData.city.trim() || null,
                file_number: formData.file_number.trim() || null,
                priority: formData.priority ? parseInt(formData.priority) : null,
                review_status: formData.review_status,
            };

            const res = await fetch('/api/providers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Fehler beim Erstellen');
            }

            setResult({ success: true, message: data.message });
            setTimeout(() => {
                onSuccess();
                onClose();
            }, 1500);
        } catch (err: any) {
            setResult({ success: false, message: err.message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                ref={modalRef}
                tabIndex={-1}
                className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-200 outline-none"
                role="dialog"
                aria-modal="true"
                aria-labelledby="create-provider-title"
            >
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center rounded-t-xl">
                    <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-primary text-2xl">add_business</span>
                        <h2 id="create-provider-title" className="text-xl font-bold text-slate-900">
                            Neuer Provider
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 transition-colors"
                        aria-label="Schließen"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                            Name <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                            placeholder="z.B. Stadtwerke Musterstadt"
                            required
                            maxLength={255}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">URL</label>
                        <input
                            type="url"
                            value={formData.url}
                            onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                            placeholder="https://beispiel.de"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">SKZ-URL</label>
                        <input
                            type="url"
                            value={formData.skz_url}
                            onChange={(e) => setFormData({ ...formData, skz_url: e.target.value })}
                            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                            placeholder="https://beispiel.de/stromkennzeichnung"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Adresse</label>
                        <input
                            type="text"
                            value={formData.address}
                            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                            placeholder="Musterstraße 12"
                            maxLength={255}
                        />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">PLZ</label>
                            <input
                                type="text"
                                value={formData.zip}
                                onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                                placeholder="12345"
                                maxLength={10}
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Stadt</label>
                            <input
                                type="text"
                                value={formData.city}
                                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                                placeholder="Musterstadt"
                                maxLength={255}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Aktenzeichen</label>
                        <input
                            type="text"
                            value={formData.file_number}
                            onChange={(e) => setFormData({ ...formData, file_number: e.target.value })}
                            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                            placeholder="12 122/123"
                            maxLength={20}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Priorität (1-100)</label>
                        <input
                            type="number"
                            value={formData.priority}
                            onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                            placeholder="50"
                            min={1}
                            max={100}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Prüfstatus</label>
                        <select
                            value={formData.review_status}
                            onChange={(e) => setFormData({ ...formData, review_status: e.target.value })}
                            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary bg-white"
                        >
                            <option value="offen">Offen</option>
                            <option value="geprueft">Geprüft</option>
                            <option value="beanstandet">Beanstandet</option>
                        </select>
                    </div>

                    {result && (
                        <div
                            className={`p-3 rounded-lg text-sm font-medium flex items-center gap-2 ${result.success ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}
                        >
                            <span className="material-symbols-outlined text-sm">
                                {result.success ? 'check_circle' : 'error'}
                            </span>
                            {result.message}
                        </div>
                    )}

                    <div className="flex gap-3 pt-4">
                        <button
                            type="submit"
                            disabled={loading}
                            className={`flex-1 px-6 py-3 rounded-lg font-semibold text-white shadow-sm transition-all flex items-center justify-center gap-2 ${loading ? 'bg-slate-400 cursor-not-allowed' : 'bg-primary hover:bg-primary/90'}`}
                        >
                            {loading ? (
                                <>
                                    <span className="material-symbols-outlined animate-spin">refresh</span>
                                    Erstelle...
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined">save</span>
                                    Provider erstellen
                                </>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-3 rounded-lg font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors flex items-center gap-2"
                        >
                            <span className="material-symbols-outlined">close</span>
                            Abbrechen
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
