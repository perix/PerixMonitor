'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import axios from 'axios';
import {
    Trash2,
    AlertTriangle,
    Loader2,
    ShieldAlert,
    Users,
    Key,
    UserX,
    FileText
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

export default function SystemMaintenancePanel() {
    const supabase = createClient();
    const [resetLoading, setResetLoading] = useState<boolean>(false);
    const [users, setUsers] = useState<User[]>([]);
    const [loadingUsers, setLoadingUsers] = useState<boolean>(false);

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
        } catch (error) {
            console.error("Failed to fetch users", error);
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

    const handleResetDatabase = async () => {
        setResetLoading(true);
        try {
            const { error } = await supabase.rpc('reset_db_data');
            if (error) throw error;
            window.location.reload();
        } catch (error: any) {
            console.error('Reset failed:', error);
            alert('Errore durante il reset del database: ' + error.message);
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
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center shadow-lg shadow-red-500/20">
                    <ShieldAlert className="text-white w-7 h-7" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-white">Manutenzione Sistema</h2>
                    <p className="text-slate-400 mt-1">Gestione utenti e reset del database</p>
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
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-white/10 hover:bg-white/5">
                                        <TableHead className="text-slate-400">Email</TableHead>
                                        <TableHead className="text-slate-400">Creato il</TableHead>
                                        <TableHead className="text-slate-400">Ultimo Login</TableHead>
                                        <TableHead className="text-right text-slate-400">Azioni</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {users.map((user) => (
                                        <TableRow key={user.id} className="border-white/10 hover:bg-white/5">
                                            <TableCell className="font-medium text-slate-200">{user.email}</TableCell>
                                            <TableCell className="text-slate-400">
                                                {new Date(user.created_at).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell className="text-slate-400">
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
                        )}
                    </CardContent>
                </Card>

                {/* DANGER ZONE - Database Reset */}
                <Card className="bg-red-950/20 backdrop-blur-md border-red-500/20">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-red-400">
                            <span className="p-2 bg-red-500/10 rounded-lg text-red-500">
                                <Trash2 className="w-4 h-4" />
                            </span>
                            Danger Zone
                        </CardTitle>
                        <CardDescription className="text-red-400/70">
                            Azioni irreversibili che modificano lo stato del sistema
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between p-4 rounded-lg border border-red-500/10 bg-red-500/5">
                            <div className="space-y-1">
                                <p className="text-sm font-medium text-red-400">Reset Database</p>
                                <p className="text-xs text-red-400/60">
                                    Cancella tutti i dati (portfolio, asset, transazioni) mantenendo gli utenti.
                                </p>
                            </div>

                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive" size="sm" className="gap-2 shrink-0">
                                        {resetLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
                                        Reset Dati
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="bg-slate-900 border-white/10 text-white">
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Sei assolutamente sicuro?</AlertDialogTitle>
                                        <AlertDialogDescription className="text-slate-400">
                                            Questa azione non può essere annullata. Cancellerà permanentemente tutti i portafogli,
                                            le transazioni e i dati storici. Il tuo account utente verrà mantenuto.
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
                                            Si, Procedi al Reset
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
