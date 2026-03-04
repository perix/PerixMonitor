'use client';

import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();
    const supabase = createClient();

    const [message, setMessage] = useState<string | null>(null);

    const handleLogin = async () => {
        setLoading(true);
        setError(null);
        setMessage(null);

        console.log("LOGIN ATTEMPT: Starting login for", email);

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            console.error("LOGIN ERROR:", error);
            setError(error.message);
        } else {
            console.log("LOGIN SUCCESS: User authenticated", data);
            router.push('/'); // Redirect to Home
        }
        setLoading(false);
    };

    const handleSignUp = async () => {
        setLoading(true);
        setError(null);
        setMessage(null);

        const { error } = await supabase.auth.signUp({
            email,
            password,
        });

        if (error) {
            setError(error.message);
        } else {
            setMessage("Registrazione effettuata! Prova ad accedere (se richiesto, controlla l'email).");
        }
        setLoading(false);
    };

    const handleResetPassword = async () => {
        if (!email) {
            setError("Inserisci la tua email per resettare la password.");
            return;
        }

        setLoading(true);
        setError(null);
        setMessage(null);

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/change-password`,
        });

        if (error) {
            setError(error.message);
        } else {
            setMessage("Email per il reset inviata! Controlla la tua casella di posta.");
        }
        setLoading(false);
    };

    return (
        <div className="flex h-screen w-full items-center justify-center p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="text-center">Accedi a PerixMonitor</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="tu@esempio.com"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2 relative">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="password">Password</Label>
                            <button
                                onClick={handleResetPassword}
                                className="text-xs text-indigo-500 hover:text-indigo-400 font-medium"
                                type="button"
                                disabled={loading}
                            >
                                Password dimenticata?
                            </button>
                        </div>
                        <Input
                            id="password"
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                        />
                    </div>

                    {error && <p className="text-sm text-red-500">{error}</p>}
                    {message && <p className="text-sm text-green-500">{message}</p>}

                    <div className="flex space-x-2 pt-2">
                        <Button className="flex-1" onClick={handleLogin} disabled={loading}>
                            {loading ? "Caricamento..." : "Accedi"}
                        </Button>
                        <Button variant="outline" className="flex-1" onClick={handleSignUp} disabled={loading}>
                            Registrati
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
