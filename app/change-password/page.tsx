'use client';

import React, { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle2, Loader2, Lock } from 'lucide-react';

export default function ChangePasswordPage() {
    const supabase = createClient();
    const router = useRouter();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (password.length < 6) {
            setError('La password deve essere di almeno 6 caratteri');
            return;
        }

        if (password !== confirmPassword) {
            setError('Le password non coincidono');
            return;
        }

        setLoading(true);
        try {
            // 1. Update password
            const { error: updateError } = await supabase.auth.updateUser({
                password: password,
                data: { needs_password_change: false } // Clear the flag
            });

            if (updateError) throw updateError;

            setSuccess(true);
            setTimeout(() => {
                router.push('/dashboard');
            }, 2000);
        } catch (err: any) {
            setError(err.message || 'Errore durante il cambio password');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
            <Card className="w-full max-w-md bg-slate-900 border-white/10 text-white">
                <CardHeader className="space-y-1">
                    <div className="flex justify-center mb-4">
                        <div className="p-3 bg-indigo-600/20 rounded-full">
                            <Lock className="h-8 w-8 text-indigo-500" />
                        </div>
                    </div>
                    <CardTitle className="text-2xl text-center">Cambio Password Obbligatorio</CardTitle>
                    <CardDescription className="text-center text-slate-400">
                        La tua password è stata resettata. Per favore scegline una nuova per continuare.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {success ? (
                        <div className="flex flex-col items-center justify-center py-6 space-y-4">
                            <CheckCircle2 className="h-12 w-12 text-green-500" />
                            <p className="text-lg font-medium">Password aggiornata!</p>
                            <p className="text-sm text-slate-400 text-center">
                                Verrai reindirizzato alla dashboard tra pochi secondi...
                            </p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="password">Nuova Password</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="bg-slate-800 border-white/10 focus:ring-indigo-500 h-11"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="confirm-password">Conferma Password</Label>
                                <Input
                                    id="confirm-password"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="bg-slate-800 border-white/10 focus:ring-indigo-500 h-11"
                                    required
                                />
                            </div>

                            {error && (
                                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3">
                                    <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                                    <p className="text-sm text-red-200">{error}</p>
                                </div>
                            )}

                            <Button
                                type="submit"
                                className="w-full bg-indigo-600 hover:bg-indigo-700 h-11 text-base font-semibold"
                                disabled={loading}
                            >
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Aggiorna Password
                            </Button>
                        </form>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
