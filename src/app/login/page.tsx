'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            });

            if (res.ok) {
                router.push('/');
            } else {
                const data = await res.json();
                setError(data.error || 'Login fehlgeschlagen');
            }
        } catch {
            setError('Verbindungsfehler');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-900 via-indigo-800 to-blue-900">
            <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">
                <div className="text-center mb-6">
                    <h1 className="text-2xl font-bold text-indigo-900">SKZ-Cockpit</h1>
                    <p className="text-sm text-gray-500 mt-1">Stromkennzeichnungs-Datenbank</p>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Passwort</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="Zugangspasswort eingeben"
                            autoFocus
                        />
                    </div>

                    {error && (
                        <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading || !password}
                        className={`w-full py-2 rounded-lg font-bold text-white transition-colors ${
                            loading || !password
                                ? 'bg-gray-400 cursor-not-allowed'
                                : 'bg-indigo-600 hover:bg-indigo-700'
                        }`}
                    >
                        {loading ? 'Anmelden...' : 'Anmelden'}
                    </button>
                </form>
            </div>
        </div>
    );
}
