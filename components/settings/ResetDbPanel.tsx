'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { usePortfolio } from '@/context/PortfolioContext';
import axios from 'axios';
import {
    Trash2,
    AlertTriangle,
    Loader2,
    Coins
} from 'lucide-react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function ResetDbPanel() {
    const supabase = createClient();
    const { portfolios, loadingPortfolios } = usePortfolio();
    const [resetLoading, setResetLoading] = useState<boolean>(false);
    const [dividendResetLoading, setDividendResetLoading] = useState<boolean>(false);
    const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>('');
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    useEffect(() => {
        fetchCurrentUser();
    }, []);

    const fetchCurrentUser = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            setCurrentUserId(user.id);
        }
    };

    const handleResetDatabase = async () => {
        setResetLoading(true);
        try {
            if (!currentUserId) throw new Error("User ID not found");

            // Fetch a valid portfolio ID or dummy
            const { data: portfolios } = await supabase.from('portfolios').select('id').limit(1);
            const pid = portfolios && portfolios.length > 0 ? portfolios[0].id : '00000000-0000-0000-0000-000000000000';

            await axios.post('/api/reset', {
                portfolio_id: pid
            });

            alert('Database resettato con successo.');
            window.location.reload();
        } catch (error: any) {
            console.error('Reset failed:', error);
            alert('Errore durante il reset del database: ' + (error.response?.data?.error || error.message));
        } finally {
            setResetLoading(false);
        }
    };

    const handleResetDividends = async () => {
        if (!selectedPortfolioId) return;
        setDividendResetLoading(true);
        try {
            const res = await axios.post('/api/reset-dividends', {
                portfolio_id: selectedPortfolioId
            });
            const deleted = res.data?.deleted ?? 0;
            alert(res.data?.message || `Cancellate ${deleted} cedole/dividendi.`);
            if (deleted > 0) {
                window.location.reload();
            }
        } catch (error: any) {
            console.error('Dividend reset failed:', error);
            alert('Errore: ' + (error.response?.data?.error || error.message));
        } finally {
            setDividendResetLoading(false);
        }
    };

    const selectedPortfolioName = portfolios.find(p => p.id === selectedPortfolioId)?.name || '';

    return (
        <div className="space-y-8">
            <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-600 to-rose-700 flex items-center justify-center shadow-lg shadow-red-500/20">
                    <Trash2 className="text-white w-7 h-7" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-white">Reset Database</h2>
                    <p className="text-slate-400 mt-1">Azioni distruttive per cancellare o ripristinare i dati</p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-8">

                {/* SELECTIVE RESET - Dividends/Coupons */}
                <Card className="bg-amber-900/20 backdrop-blur-md border border-amber-500/40">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-amber-400">
                            <span className="p-2 bg-amber-500/20 rounded-lg text-amber-400">
                                <Coins className="w-4 h-4" />
                            </span>
                            Cancella Cedole / Dividendi
                        </CardTitle>
                        <CardDescription className="text-amber-300/70">
                            Rimuovi tutte le cedole e i dividendi per un portafoglio specifico
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 rounded-lg border border-amber-500/30 bg-amber-500/10">
                            <div className="space-y-1 flex-1">
                                <p className="text-sm text-amber-200/80 leading-relaxed">
                                    Seleziona un portafoglio e cancella <b>tutte</b> le cedole e i dividendi associati ai suoi asset.
                                    <br />
                                    <span className="text-green-400/90 font-medium text-xs">Transazioni, Asset e Prezzi NON verranno toccati.</span>
                                </p>
                                <div className="pt-2">
                                    <Select value={selectedPortfolioId} onValueChange={setSelectedPortfolioId}>
                                        <SelectTrigger className="w-full sm:w-72 bg-black/30 border-amber-500/30 text-white">
                                            <SelectValue placeholder={loadingPortfolios ? "Caricamento..." : "Seleziona portafoglio..."} />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-900 border-white/10">
                                            {portfolios.map(p => (
                                                <SelectItem key={p.id} value={p.id} className="text-white hover:bg-white/10">
                                                    {p.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={!selectedPortfolioId || dividendResetLoading}
                                        className="gap-2 shrink-0 border-amber-500/50 text-amber-300 hover:bg-amber-500/30 hover:text-amber-200 disabled:opacity-40"
                                    >
                                        {dividendResetLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                        Cancella Cedole
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="bg-slate-900 border-amber-500/30 text-white">
                                    <AlertDialogHeader>
                                        <AlertDialogTitle className="text-amber-400">Confermi la cancellazione?</AlertDialogTitle>
                                        <AlertDialogDescription className="text-slate-300">
                                            Verranno cancellate <b>tutte le cedole e i dividendi</b> (incluse le spese) per il portafoglio:
                                            <br />
                                            <span className="text-amber-300 font-bold text-base">{selectedPortfolioName}</span>
                                            <br /><br />
                                            Le transazioni e gli asset <b>non</b> verranno toccati.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel className="bg-transparent border-white/10 hover:bg-white/5 text-white hover:text-white">
                                            Annulla
                                        </AlertDialogCancel>
                                        <AlertDialogAction
                                            onClick={handleResetDividends}
                                            className="bg-amber-600 hover:bg-amber-700 text-white border-none"
                                        >
                                            Sì, Cancella Cedole
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </CardContent>
                </Card>

                {/* DANGER ZONE - Database Reset */}
                <Card className="bg-red-900/40 backdrop-blur-md border border-red-500/50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-red-400">
                            <span className="p-2 bg-red-500/20 rounded-lg text-red-400">
                                <Trash2 className="w-4 h-4" />
                            </span>
                            Danger Zone
                        </CardTitle>
                        <CardDescription className="text-red-300/80">
                            Azioni distruttive per la gestione dei dati
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">

                        {/* 1. USER RESET */}
                        <div className="flex items-center justify-between p-4 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition-colors">
                            <div className="space-y-1">
                                <p className="text-base font-medium text-red-300">Reset Utente (Soft)</p>
                                <p className="text-sm text-red-300/70 leading-relaxed max-w-md">
                                    Cancella solo i <b>tuoi</b> portafogli e transazioni.
                                    <br />
                                    <span className="text-green-400/90 font-medium">Mantiene Asset e Prezzi globali.</span>
                                    <br />
                                    Utile se vuoi ricaricare le tue transazioni senza perdere i dati di mercato.
                                </p>
                            </div>

                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="outline" size="sm" className="gap-2 shrink-0 border-red-500/50 text-red-300 hover:bg-red-500/30 hover:text-red-200">
                                        {resetLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                        Reset Utente
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="bg-slate-900 border-red-500/30 text-white">
                                    <AlertDialogHeader>
                                        <AlertDialogTitle className="text-red-500">Confermi il Reset Utente?</AlertDialogTitle>
                                        <AlertDialogDescription className="text-slate-300">
                                            Verranno cancellati tutti i tuoi portafogli, le note e lo storico transazioni.
                                            <br /><br />
                                            <b>Gli Asset globali e i Prezzi NON verranno cancellati.</b>
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel className="bg-transparent border-white/10 hover:bg-white/5 text-white hover:text-white">
                                            Annulla
                                        </AlertDialogCancel>
                                        <AlertDialogAction
                                            onClick={handleResetDatabase}
                                            className="bg-red-600 hover:bg-red-700 text-white border-none"
                                        >
                                            Reset I Miei Dati
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>

                        {/* 2. SYSTEM RESET */}
                        <div className="flex items-center justify-between p-4 rounded-lg border border-red-500/50 bg-red-900/40 hover:bg-red-900/60 transition-colors">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <p className="text-base font-medium text-red-400">Reset Sistema (Hard)</p>
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white uppercase tracking-wider">Admin</span>
                                </div>
                                <p className="text-sm text-red-300/70 leading-relaxed max-w-md">
                                    <b className="text-red-400">NUCLEAR OPTION.</b> Cancella TUTTO dal database.
                                    <br />
                                    Include Portafogli, Asset, Prezzi e Configurazioni.
                                    <br />
                                    Richiederà un re-ingest completo dei dati di mercato.
                                </p>
                            </div>

                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive" size="sm" className="gap-2 shrink-0 bg-red-700 hover:bg-red-800">
                                        {resetLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
                                        Reset COMPLETO
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="bg-red-950 border-red-500 text-white">
                                    <AlertDialogHeader>
                                        <div className="flex items-center gap-2 text-red-500 mb-2">
                                            <AlertTriangle className="w-6 h-6" />
                                            <span className="font-bold text-lg">ATTENZIONE: WIPE TOTALE</span>
                                        </div>
                                        <AlertDialogTitle className="text-white">Sei davvero sicuro?</AlertDialogTitle>
                                        <AlertDialogDescription asChild className="text-red-200">
                                            <div>
                                                Questa azione è <b>IRREVERSIBILE</b>.
                                                <br /><br />
                                                Cancellerà:
                                                <ul className="list-disc list-inside mt-2 space-y-1">
                                                    <li>Tutti i Portafogli di tutti gli utenti</li>
                                                    <li>Tutte le Transazioni</li>
                                                    <li>Tutti gli Asset (Anagrafiche)</li>
                                                    <li>Tutti i Prezzi storici</li>
                                                </ul>
                                                <br />
                                                Il sistema tornerà allo stato vuoto.
                                            </div>
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel className="bg-transparent border-white/20 hover:bg-white/10 text-white hover:text-white">
                                            FERMATI
                                        </AlertDialogCancel>
                                        <AlertDialogAction
                                            onClick={async () => {
                                                setResetLoading(true);
                                                try {
                                                    await axios.post('/api/admin/reset-system');
                                                    alert('Sistema resettato completamente.');
                                                    window.location.reload();
                                                } catch (e: any) {
                                                    console.error(e);
                                                    alert("Errore Reset Sistema: " + e.message);
                                                } finally {
                                                    setResetLoading(false);
                                                }
                                            }}
                                            className="bg-red-600 hover:bg-red-700 text-white border-none font-bold"
                                        >
                                            SI, CANCELLA TUTTO
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>

                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
