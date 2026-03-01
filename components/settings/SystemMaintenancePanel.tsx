'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import axios from 'axios';
import {
    Loader2,
    Users,
    Key,
    UserX,
    FileText,
    Wrench
} from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePortfolio } from '@/context/PortfolioContext';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"


interface User {
    id: string;
    email: string;
    created_at: string;
    last_sign_in_at: string;
}

// Restore Component
function RestoreBackupArea({ userId, onRestoreComplete }: { userId: string | null; onRestoreComplete: (newPortfolioId: string) => void }) {
    const [file, setFile] = useState<File | null>(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<any>(null);
    const [restoreModalOpen, setRestoreModalOpen] = useState(false);
    const [restoring, setRestoring] = useState(false);
    const [newName, setNewName] = useState("");

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
            setFile(selectedFile);
            handleAnalyze(selectedFile);
        }
    };

    const handleAnalyze = async (fileToAnalyze: File) => {
        setAnalyzing(true);
        const formData = new FormData();
        formData.append('file', fileToAnalyze);

        try {
            const res = await axios.post('/api/backup/analyze', formData);
            setAnalysisResult(res.data);
            setNewName(res.data.proposed_name);
            setRestoreModalOpen(true);
        } catch (error: any) {
            console.error("Analysis failed", error);
            alert("Errore analisi file: " + (error.response?.data?.error || error.message));
            setFile(null);
        } finally {
            setAnalyzing(false);
        }
    };

    const handleRestore = async () => {
        if (!analysisResult || !newName) return;

        setRestoring(true);
        try {
            // We need to send the JSON content directly or upload file again?
            // Sending JSON content is easier if we have it from analysis preview, 
            // BUT for large files verify if analysis returns data. 
            // In backup_service.py we returned `data_preview`.

            const res = await axios.post('/api/backup/restore', {
                backup_content: analysisResult.data_preview,
                new_name: newName,
                user_id: userId
            });

            if (res.data.new_portfolio_id) {
                onRestoreComplete(res.data.new_portfolio_id);
            }

            alert("Ripristino completato con successo!");
            setRestoreModalOpen(false);
            setFile(null);
            setAnalysisResult(null);
        } catch (error: any) {
            console.error("Restore failed", error);
            alert("Errore ripristino: " + (error.response?.data?.error || error.message));
        } finally {
            setRestoring(false);
        }
    };

    return (
        <div>
            <div className="flex items-center gap-4">
                <div className="grid w-full max-w-sm items-center gap-1.5">
                    <Label htmlFor="backup-file" className="cursor-pointer">
                        <div className="flex items-center justify-center w-full h-32 px-4 transition bg-slate-900 border-2 border-slate-700 border-dashed rounded-md appearance-none cursor-pointer hover:border-slate-500 focus:outline-none">
                            <span className="flex items-center space-x-2">
                                {analyzing ? (
                                    <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                    </svg>
                                )}
                                <span className="font-medium text-slate-400">
                                    {analyzing ? "Analisi in corso..." : "Clicca per caricare il backup"}
                                </span>
                            </span>
                            <input id="backup-file" type="file" accept=".json" className="hidden" onChange={handleFileChange} disabled={analyzing} />
                        </div>
                    </Label>
                </div>
            </div>

            <Dialog open={restoreModalOpen} onOpenChange={setRestoreModalOpen}>
                <DialogContent className="bg-slate-900 border-white/10 text-white max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Anteprima Ripristino</DialogTitle>
                        <DialogDescription className="text-slate-400">
                            Verifica i dettagli del backup prima di procedere.
                        </DialogDescription>
                    </DialogHeader>

                    {analysisResult && (
                        <div className="space-y-6 py-4">
                            {/* Summary Metadata */}
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div className="p-3 bg-slate-800 rounded-lg">
                                    <p className="text-slate-500">Nome Originale</p>
                                    <p className="font-medium text-white">{analysisResult.original_name}</p>
                                </div>
                                <div className="p-3 bg-slate-800 rounded-lg">
                                    <p className="text-slate-500">Data Backup</p>
                                    <p className="font-medium text-white">
                                        {new Date(analysisResult.backup_date).toLocaleString()}
                                    </p>
                                </div>
                                <div className="p-3 bg-slate-800 rounded-lg">
                                    <p className="text-slate-500">Valore Iniziale</p>
                                    <p className="font-medium text-white">
                                        € {Number(analysisResult.report.initial_value).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                                    </p>
                                </div>
                                <div className="p-3 bg-slate-800 rounded-lg">
                                    <p className="text-slate-500">Valore Finale</p>
                                    <p className="font-medium text-white">
                                        € {Number(analysisResult.report.final_value).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                                    </p>
                                </div>
                                <div className="p-3 bg-slate-800 rounded-lg border border-indigo-500/30">
                                    <p className="text-indigo-400 font-semibold">MWR Periodo</p>
                                    <p className="font-bold text-white text-lg">
                                        {Number(analysisResult.report.overall_mwr).toLocaleString('it-IT', { minimumFractionDigits: 2 })}%
                                    </p>
                                </div>
                                <div className="p-3 bg-slate-800 rounded-lg">
                                    <p className="text-slate-500">Periodo Attività</p>
                                    <p className="font-medium text-white text-xs">
                                        {analysisResult.report.first_activity ? new Date(analysisResult.report.first_activity).toLocaleDateString() : '-'}
                                        {' -> '}
                                        {analysisResult.report.last_activity ? new Date(analysisResult.report.last_activity).toLocaleDateString() : '-'}
                                    </p>
                                </div>
                                <div className="p-3 bg-slate-800 rounded-lg">
                                    <p className="text-slate-500">Asset Inclusi</p>
                                    <p className="font-medium text-white">{analysisResult.report.asset_count}</p>
                                </div>
                                <div className="p-3 bg-slate-800 rounded-lg">
                                    <p className="text-slate-500">Dati Storici</p>
                                    <p className="font-medium text-white text-[11px]">
                                        {analysisResult.report.total_transactions} Transazioni, {analysisResult.report.total_dividends} Dividendi
                                    </p>
                                </div>
                            </div>

                            {/* Assets List Preview */}
                            <div>
                                <p className="text-sm font-medium mb-2 text-slate-400">Asset Inclusi ({analysisResult.report.asset_count})</p>
                                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 h-32 overflow-y-auto text-xs text-slate-300 font-mono">
                                    <ul className="space-y-1">
                                        {analysisResult.report.assets_list.map((a: string, i: number) => (
                                            <li key={i}>• {a}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            {/* Name Input */}
                            <div className="space-y-2 pt-4 border-t border-slate-800">
                                <Label htmlFor="new-name" className="text-indigo-400">Nome Nuovo Portafoglio</Label>
                                <input
                                    id="new-name"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-md p-2 text-white focus:ring-1 focus:ring-indigo-500"
                                />
                                <p className="text-xs text-slate-500">
                                    Verrà creato un nuovo portafoglio con questo nome.
                                </p>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setRestoreModalOpen(false)}>Annulla</Button>
                        <Button onClick={handleRestore} disabled={restoring} className="bg-indigo-600 hover:bg-indigo-700">
                            {restoring && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Conferma Ripristino
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default function SystemMaintenancePanel() {
    const supabase = createClient();
    const [resetLoading, setResetLoading] = useState<boolean>(false);
    const [users, setUsers] = useState<User[]>([]);
    const [loadingUsers, setLoadingUsers] = useState<boolean>(false);

    // BACKUP STATE
    const { selectedPortfolioId, setSelectedPortfolioId, portfolios, refreshPortfolios } = usePortfolio();

    const [selectedPortfolioBackup, setSelectedPortfolioBackup] = useState<string>(selectedPortfolioId || "");
    const [backupPreviewData, setBackupPreviewData] = useState<any>(null);
    const [backupPreviewOpen, setBackupPreviewOpen] = useState(false);
    const [preparingBackup, setPreparingBackup] = useState(false);
    const [backupCustomFilename, setBackupCustomFilename] = useState("");

    // User Action States
    const [deletingUser, setDeletingUser] = useState<string | null>(null);
    const [resettingPwdUser, setResettingPwdUser] = useState<User | null>(null);
    const [pwdLoading, setPwdLoading] = useState<boolean>(false);

    // Log Config States
    const [logEnabled, setLogEnabled] = useState<boolean>(false);
    const [loadingLogConfig, setLoadingLogConfig] = useState<boolean>(false);
    const [savingLogConfig, setSavingLogConfig] = useState<boolean>(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    useEffect(() => {
        fetchCurrentUser();
        fetchUsers();
    }, []);

    // Set default backup portfolio if not set
    useEffect(() => {
        if (selectedPortfolioId && !selectedPortfolioBackup) {
            setSelectedPortfolioBackup(selectedPortfolioId);
        }
    }, [selectedPortfolioId]);

    useEffect(() => {
        if (currentUserId) {
            fetchLogConfig();
        }
    }, [currentUserId]);

    const fetchCurrentUser = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            setCurrentUserId(user.id);
        }
    };



    const fetchUsers = async () => {
        setLoadingUsers(true);
        try {
            const res = await axios.get('/api/admin/users');
            setUsers(res.data.users || []);
        } catch (error: any) {
            console.error("Failed to fetch users. Response:", error.response);
            console.error("Full Error:", error);
            // Optionally set an error state to show in UI
        } finally {
            setLoadingUsers(false);
        }
    };

    const fetchLogConfig = async () => {
        if (!currentUserId) return;
        setLoadingLogConfig(true);
        try {
            const res = await axios.get(`/api/settings/log-config?user_id=${currentUserId}`);
            setLogEnabled(res.data.enabled || false);
        } catch (error) {
            console.error("Failed to fetch log config", error);
        } finally {
            setLoadingLogConfig(false);
        }
    };

    const handleLogToggle = async (enabled: boolean) => {
        if (!currentUserId) return;
        setSavingLogConfig(true);
        try {
            await axios.post('/api/settings/log-config', { enabled, user_id: currentUserId });
            setLogEnabled(enabled);
            // Dispatch event to notify Settings page
            window.dispatchEvent(new CustomEvent('log-config-changed'));
        } catch (error) {
            console.error("Failed to save log config", error);
        } finally {
            setSavingLogConfig(false);
        }
    };

    const handlePrepareBackup = async () => {
        if (!selectedPortfolioBackup) return;
        setPreparingBackup(true);
        try {
            const res = await axios.get(`/api/backup/download?portfolio_id=${selectedPortfolioBackup}`);
            setBackupPreviewData(res.data);

            // Set default filename
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const pName = res.data.portfolio?.name || 'Portfolio';
            setBackupCustomFilename(`${dateStr}-${pName.replace(/\s+/g, '_')}.json`);

            setBackupPreviewOpen(true);
        } catch (e: any) {
            console.error("Backup fetch failed", e);
            alert("Errore preparazione backup: " + e.message);
        } finally {
            setPreparingBackup(false);
        }
    };

    const handleConfirmDownload = () => {
        if (!backupPreviewData) return;
        const jsonString = JSON.stringify(backupPreviewData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = backupCustomFilename || 'backup.json';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        setBackupPreviewOpen(false);
    };

    const handleResetDatabase = async () => {
        setResetLoading(true);
        try {
            // Use Backend API instead of direct RPC for better permission handling
            if (!currentUserId) throw new Error("User ID not found");

            // We need a portfolio_id (or just pass user_id and let backend handle it, 
            // but backend expects portfolio_id currently. Let's see index.py)
            // Index.py line 417 checks portfolio_id.
            // But this is a SYSTEM reset. 
            // Wait, index.py checks `portfolio_id = data.get('portfolio_id')`.
            // If I pass a dummy or fetch one?
            // Actually, the reset logic in backend (lines 425+) deletes EVERYTHING neq -1.
            // It uses portfolio_id mostly for logging?
            // "FULL WIPE COMPLETED for Portfolio {portfolio_id}"

            // Let's first fetch a portfolio ID or pass a placeholder if allowed.
            // But to be safe, let's fetch one.
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

    const handleDeleteUser = async (userId: string) => {
        if (!confirm("Sei sicuro di voler eliminare questo utente?")) return;

        setDeletingUser(userId);
        try {
            await axios.delete(`/api/admin/users/${userId}`);
            await fetchUsers(); // Refresh list
        } catch (error: any) {
            console.error("Delete user failed", error);
            alert("Errore eliminazione utente: " + error.message);
        } finally {
            setDeletingUser(null);
        }
    };

    const handleResetPassword = async () => {
        if (!resettingPwdUser) return;

        setPwdLoading(true);
        try {
            const res = await axios.post(`/api/admin/users/${resettingPwdUser.id}/reset_password`);
            alert(res.data.message || `Email di reset inviata a ${resettingPwdUser.email}`);
            setResettingPwdUser(null);
        } catch (error: any) {
            console.error("Reset password failed", error);
            alert("Errore invio email reset: " + (error.response?.data?.error || error.message));
        } finally {
            setPwdLoading(false);
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-700 flex items-center justify-center shadow-lg shadow-blue-500/20">
                    <Wrench className="text-white w-7 h-7" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-white">Manutenzione Sistema</h2>
                    <p className="text-slate-400 mt-1">Gestione utenti, backup e reset del database</p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-8">

                {/* LOG CONFIGURATION */}
                <Card className="bg-card/50 backdrop-blur-md border-white/40">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-foreground">
                            <span className="p-2 bg-amber-500/10 rounded-lg text-amber-500">
                                <FileText className="w-4 h-4" />
                            </span>
                            Configurazione Log
                        </CardTitle>
                        <CardDescription>Abilita o disabilita il logging su file</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between p-4 rounded-lg border border-white/20 bg-white/5">
                            <div className="space-y-1">
                                <Label htmlFor="log-toggle" className="text-sm font-medium text-slate-200">File Logging</Label>
                                <p className="text-xs text-slate-400">
                                    Quando abilitato, i log vengono salvati su file per debug avanzato.
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                {(loadingLogConfig || savingLogConfig) && (
                                    <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                                )}
                                <Switch
                                    id="log-toggle"
                                    checked={logEnabled}
                                    onCheckedChange={handleLogToggle}
                                    disabled={loadingLogConfig || savingLogConfig}
                                    className="data-[state=checked]:bg-amber-500"
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* USER MANAGEMENT */}
                <Card className="bg-card/50 backdrop-blur-md border-white/40">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-foreground">
                            <span className="p-2 bg-indigo-500/10 rounded-lg text-indigo-500">
                                <Users className="w-4 h-4" />
                            </span>
                            Gestione Utenti
                        </CardTitle>
                        <CardDescription>Elenco utenti registrati e azioni amministrative</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loadingUsers ? (
                            <div className="flex justify-center p-8">
                                <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
                            </div>
                        ) : (
                            <div className="rounded-xl border border-slate-600 overflow-hidden">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-slate-800/80 border-b border-slate-600 hover:bg-slate-800/80">
                                            <TableHead className="text-slate-200 font-semibold border-r border-slate-700">Email</TableHead>
                                            <TableHead className="text-slate-200 font-semibold border-r border-slate-700">Creato il</TableHead>
                                            <TableHead className="text-slate-200 font-semibold border-r border-slate-700">Ultimo Login</TableHead>
                                            <TableHead className="text-right text-slate-200 font-semibold">Azioni</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {users.map((user, index) => (
                                            <TableRow
                                                key={user.id}
                                                className={`border-b border-slate-700 hover:bg-slate-800/40 transition-colors ${index % 2 === 0 ? 'bg-slate-900/30' : 'bg-slate-900/50'}`}
                                            >
                                                <TableCell className="font-medium text-slate-200 border-r border-slate-700/50">{user.email}</TableCell>
                                                <TableCell className="text-slate-400 border-r border-slate-700/50">
                                                    {new Date(user.created_at).toLocaleDateString()}
                                                </TableCell>
                                                <TableCell className="text-slate-400 border-r border-slate-700/50">
                                                    {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : 'Mai'}
                                                </TableCell>
                                                <TableCell className="text-right space-x-2">
                                                    <Dialog open={resettingPwdUser?.id === user.id} onOpenChange={(open) => {
                                                        if (!open) { setResettingPwdUser(null); }
                                                        else setResettingPwdUser(user);
                                                    }}>
                                                        <DialogTrigger asChild>
                                                            <Button variant="outline" size="sm" className="h-8 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-300">
                                                                <Key className="w-3 h-3 mr-1" /> Reset Pwd
                                                            </Button>
                                                        </DialogTrigger>
                                                        <DialogContent className="bg-slate-900 border-white/10 text-white">
                                                            <DialogHeader>
                                                                <DialogTitle>Invia Email Reset Password</DialogTitle>
                                                                <DialogDescription className="text-slate-400">
                                                                    Verrà inviata un'email a <b className="text-white">{user.email}</b> con un link per reimpostare la password.
                                                                    <br /><br />
                                                                    L'utente dovrà cliccare sul link nell'email e scegliere una nuova password.
                                                                </DialogDescription>
                                                            </DialogHeader>
                                                            <DialogFooter className="pt-4">
                                                                <Button variant="ghost" onClick={() => setResettingPwdUser(null)}>Annulla</Button>
                                                                <Button onClick={handleResetPassword} disabled={pwdLoading} className="bg-indigo-600 hover:bg-indigo-700">
                                                                    {pwdLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                                                                    Invia Email
                                                                </Button>
                                                            </DialogFooter>
                                                        </DialogContent>
                                                    </Dialog>

                                                    <Button
                                                        variant="destructive"
                                                        size="sm"
                                                        className="h-8"
                                                        onClick={() => handleDeleteUser(user.id)}
                                                        disabled={deletingUser === user.id}
                                                    >
                                                        {deletingUser === user.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserX className="w-3 h-3" />}
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {users.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center py-8 text-slate-500">
                                                    Nessun utente trovato
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* BACKUP & RESTORE */}
                <Card className="bg-card/50 backdrop-blur-md border-white/40">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-foreground">
                            <span className="p-2 bg-emerald-500/10 rounded-lg text-emerald-500">
                                <FileText className="w-4 h-4" />
                            </span>
                            Backup & Ripristino
                        </CardTitle>
                        <CardDescription>Esporta i tuoi dati in locale o ripristina un portafoglio da file</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">

                        {/* BACKUP SECTION */}
                        <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center p-4 rounded-lg border border-white/20 bg-white/5">
                            <div className="space-y-1">
                                <Label className="text-sm font-medium text-slate-200">Esegui Backup</Label>
                                <p className="text-xs text-slate-400 max-w-sm">
                                    Scarica un file JSON completo contenente tutti i dati del portafoglio selezionato.
                                </p>
                            </div>
                            <div className="flex items-center gap-2 w-full md:w-auto">
                                <select
                                    className="h-9 w-full md:w-48 rounded-md border border-slate-700 bg-slate-900 px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 text-slate-200"
                                    onChange={(e) => setSelectedPortfolioBackup(e.target.value)}
                                    value={selectedPortfolioBackup}
                                >
                                    <option value="" disabled>Seleziona Portafoglio</option>
                                    {portfolios.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 gap-2"
                                    disabled={!selectedPortfolioBackup}
                                    onClick={handlePrepareBackup}
                                >
                                    {preparingBackup ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                                    Genera Backup
                                </Button>
                            </div>
                        </div>

                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t border-slate-700" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-slate-900 px-2 text-slate-500">Oppure</span>
                            </div>
                        </div>

                        {/* RESTORE SECTION */}
                        <div className="space-y-4">
                            <div className="space-y-1">
                                <Label className="text-sm font-medium text-slate-200">Ripristina da File</Label>
                                <p className="text-xs text-slate-400">
                                    Carica un file di backup (.json) per creare un nuovo portafoglio con i dati importati.
                                </p>
                            </div>

                            <RestoreBackupArea userId={currentUserId} onRestoreComplete={async (newPortfolioId) => {
                                await refreshPortfolios();
                                setSelectedPortfolioId(newPortfolioId);
                            }} />
                        </div>

                    </CardContent>
                </Card>
            </div>

            {/* PREVIEW BACKUP DIALOG */}
            <Dialog open={backupPreviewOpen} onOpenChange={setBackupPreviewOpen}>
                <DialogContent className="bg-slate-900 border-white/10 text-white max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Anteprima Backup</DialogTitle>
                        <DialogDescription className="text-slate-400">
                            Ecco i dati che verranno salvati nel file di backup.
                        </DialogDescription>
                    </DialogHeader>

                    {backupPreviewData && backupPreviewData.report && (
                        <div className="space-y-6 py-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div className="p-3 bg-slate-800 rounded-lg">
                                    <p className="text-slate-500">Portafoglio</p>
                                    <p className="font-medium text-white">{backupPreviewData.portfolio.name}</p>
                                </div>
                                <div className="p-3 bg-slate-800 rounded-lg">
                                    <p className="text-slate-500">Data Creazione</p>
                                    <p className="font-medium text-white">
                                        {new Date(backupPreviewData.metadata.created_at).toLocaleString()}
                                    </p>
                                </div>
                                <div className="p-3 bg-slate-800 rounded-lg">
                                    <p className="text-slate-500">Valore Iniziale</p>
                                    <p className="font-medium text-white">
                                        € {Number(backupPreviewData.report.initial_value).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                                    </p>
                                </div>
                                <div className="p-3 bg-slate-800 rounded-lg">
                                    <p className="text-slate-500">Valore Finale</p>
                                    <p className="font-medium text-white">
                                        € {Number(backupPreviewData.report.final_value).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                                    </p>
                                </div>
                                <div className="p-3 bg-slate-800 rounded-lg border border-indigo-500/30">
                                    <p className="text-indigo-400 font-semibold">MWR Periodo</p>
                                    <p className="font-bold text-white text-lg">
                                        {Number(backupPreviewData.report.overall_mwr).toLocaleString('it-IT', { minimumFractionDigits: 2 })}%
                                    </p>
                                </div>
                                <div className="p-3 bg-slate-800 rounded-lg">
                                    <p className="text-slate-500">Periodo Attività</p>
                                    <p className="font-medium text-white text-xs">
                                        {backupPreviewData.report.first_activity ? new Date(backupPreviewData.report.first_activity).toLocaleDateString() : '-'}
                                        {' -> '}
                                        {backupPreviewData.report.last_activity ? new Date(backupPreviewData.report.last_activity).toLocaleDateString() : '-'}
                                    </p>
                                </div>
                                <div className="p-3 bg-slate-800 rounded-lg">
                                    <p className="text-slate-500">Asset Inclusi</p>
                                    <p className="font-medium text-white">{backupPreviewData.report.asset_count}</p>
                                </div>
                                <div className="p-3 bg-slate-800 rounded-lg">
                                    <p className="text-slate-500">Dati Storici</p>
                                    <p className="font-medium text-white text-[11px]">
                                        {backupPreviewData.report.total_transactions} Transazioni, {backupPreviewData.report.total_dividends} Dividendi
                                    </p>
                                </div>
                            </div>

                            <div>
                                <p className="text-sm font-medium mb-2 text-slate-400">Elenco Asset</p>
                                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 h-32 overflow-y-auto text-xs text-slate-300 font-mono">
                                    <ul className="space-y-1">
                                        {backupPreviewData.report.assets_list.map((a: string, i: number) => (
                                            <li key={i}>• {a}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            <div className="space-y-2 pt-4 border-t border-slate-800">
                                <Label htmlFor="backup-filename" className="text-indigo-400">Nome File di Backup</Label>
                                <div className="flex gap-2">
                                    <input
                                        id="backup-filename"
                                        value={backupCustomFilename}
                                        onChange={(e) => setBackupCustomFilename(e.target.value)}
                                        className="flex-1 bg-slate-950 border border-slate-700 rounded-md p-2 text-white text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                                    />
                                </div>
                                <p className="text-[10px] text-slate-500">
                                    Puoi cambiare il nome del file prima del download. Estensione .json consigliata.
                                </p>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setBackupPreviewOpen(false)}>Annulla</Button>
                        <Button onClick={handleConfirmDownload} className="bg-emerald-600 hover:bg-emerald-700">
                            <FileText className="w-4 h-4 mr-2" />
                            Scarica File JSON
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
