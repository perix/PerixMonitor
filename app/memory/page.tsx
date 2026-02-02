"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { usePortfolio } from "@/context/PortfolioContext";
import { Card, CardContent } from "@/components/ui/card";
import { MemoryTable, MemoryData } from "@/components/memory/MemoryTable";
import axios from "axios";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";
import { SortingState, ColumnFiltersState, VisibilityState } from "@tanstack/react-table";

export default function MemoryPage() {
    const { selectedPortfolioId, memoryCache, setMemoryCache, portfolioCache } = usePortfolio();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Global Editing State
    const [editedNotes, setEditedNotes] = useState<Record<string, string>>({});
    const [isSaving, setIsSaving] = useState(false);

    // --- Persistence State ---
    const [userId, setUserId] = useState<string | null>(null);
    const [settingsLoaded, setSettingsLoaded] = useState(false);

    // Table State
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
    const [columnSizing, setColumnSizing] = useState<Record<string, number>>({});

    const supabase = createClient();

    // 1. Get User ID
    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setUserId(user.id);
            }
        };
        getUser();
    }, []);

    // 2. Fetch Settings from DB
    useEffect(() => {
        const fetchSettings = async () => {
            if (!userId || !selectedPortfolioId) return;

            try {
                const res = await axios.get('/api/memory/settings', {
                    params: { user_id: userId, portfolio_id: selectedPortfolioId }
                });

                if (res.data && res.data.settings) {
                    const s = res.data.settings;
                    if (s.sorting) setSorting(s.sorting);
                    if (s.columnFilters) setColumnFilters(s.columnFilters);
                    if (s.columnVisibility) setColumnVisibility(s.columnVisibility);
                    if (s.columnSizing) setColumnSizing(s.columnSizing);
                }
            } catch (e) {
                console.error("Error fetching settings", e);
            } finally {
                setSettingsLoaded(true);
            }
        };

        if (userId && selectedPortfolioId) {
            setSettingsLoaded(false); // Reset before fetch
            fetchSettings();
        }
    }, [userId, selectedPortfolioId]);

    // 3. Save Settings to DB (Debounced)
    useEffect(() => {
        // Don't save if not loaded yet or missing IDs
        if (!settingsLoaded || !userId || !selectedPortfolioId) return;

        const timer = setTimeout(async () => {
            try {
                const settings = {
                    sorting,
                    columnFilters,
                    columnVisibility,
                    columnSizing
                };

                await axios.post('/api/memory/settings', {
                    user_id: userId,
                    portfolio_id: selectedPortfolioId,
                    settings
                });
            } catch (e) {
                console.error("Error saving settings", e);
            }
        }, 1000); // 1 sec debounce

        return () => clearTimeout(timer);
    }, [sorting, columnFilters, columnVisibility, columnSizing, userId, selectedPortfolioId, settingsLoaded]);


    // Get portfolio name from cache if available
    const portfolioName = selectedPortfolioId && portfolioCache[selectedPortfolioId]
        ? portfolioCache[selectedPortfolioId].name
        : "Portafoglio";

    useEffect(() => {
        const fetchData = async () => {
            if (!selectedPortfolioId) return;

            // Check Cache (re-fetch if empty or simple check?)
            // We'll trust cache for data, but re-fetch if needed.
            // For now, simple cache check.
            if (memoryCache[selectedPortfolioId]) {
                return;
            }

            setLoading(true);
            setError(null);
            try {
                const res = await axios.get('/api/memory/data', {
                    params: { portfolio_id: selectedPortfolioId }
                });

                if (res.data && res.data.data) {
                    setMemoryCache(selectedPortfolioId, res.data.data);
                }
            } catch (err: any) {
                console.error("Error fetching memory data", err);
                setError(err.response?.data?.error || err.message || "Errore sconosciuto");
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [selectedPortfolioId, memoryCache, setMemoryCache]);

    // Handle Note Change (Lifted State)
    const handleNoteChange = useCallback((id: string, value: string) => {
        setEditedNotes(prev => ({
            ...prev,
            [id]: value
        }));
    }, []);

    // Global Save Function request
    const handleGlobalSave = async () => {
        if (!selectedPortfolioId) return;

        setIsSaving(true);
        try {
            const updates = Object.entries(editedNotes);
            const promises = updates.map(([assetId, note]) =>
                axios.post('/api/memory/notes', {
                    portfolio_id: selectedPortfolioId,
                    asset_id: assetId,
                    note: note
                })
            );

            await Promise.all(promises);

            // Update Context Cache locally
            if (memoryCache[selectedPortfolioId]) {
                const updatedCache = memoryCache[selectedPortfolioId].map((item: MemoryData) =>
                    editedNotes[item.id] !== undefined ? { ...item, note: editedNotes[item.id] } : item
                );
                setMemoryCache(selectedPortfolioId, updatedCache);
            }

            // Clear edits
            setEditedNotes({});

        } catch (error) {
            console.error("Global Save Error", error);
            alert("Errore durante il salvataggio");
        } finally {
            setIsSaving(false);
        }
    };

    const hasChanges = Object.keys(editedNotes).length > 0;

    if (!selectedPortfolioId) {
        return (
            <div className="flex flex-col items-center justify-center p-8 space-y-4">
                <h2 className="text-xl font-semibold">Seleziona un portafoglio</h2>
                <p className="text-muted-foreground">Devi selezionare un portafoglio per visualizzare lo storico.</p>
            </div>
        )
    }

    const data = memoryCache[selectedPortfolioId] || [];

    return (
        <div className="pl-1 pr-4 py-1 space-y-0 h-[calc(100vh-2rem)] flex flex-col">
            <div className="flex items-center justify-between flex-shrink-0">
                <div className="flex flex-col space-y-1">
                    <h1 className="text-2xl font-bold tracking-tight">Note & Storico - {portfolioName}</h1>
                    <p className="text-muted-foreground text-sm">
                        Lista Asset, date, P&L e Note dell'utente.
                    </p>
                </div>

                {/* Global Save Button */}
                <div className="flex items-center gap-2">
                    {hasChanges && (
                        <span className="text-sm text-amber-600 animate-pulse">
                            Modifiche non salvate
                        </span>
                    )}
                    <Button
                        onClick={handleGlobalSave}
                        disabled={!hasChanges || isSaving}
                        className={hasChanges ? "bg-green-600 hover:bg-green-700" : ""}
                    >
                        {isSaving ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Save className="mr-2 h-4 w-4" />
                        )}
                        Salva Modifiche
                    </Button>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : error ? (
                <div className="p-4 border border-red-200 bg-red-50 text-red-800 rounded-md">
                    Errore: {error}
                </div>
            ) : (
                <Card className="flex-1 flex flex-col overflow-hidden border-0 shadow-none min-h-0">
                    <CardContent className="flex-1 flex flex-col p-0 pt-2 min-h-0">
                        {/* We pass editedNotes to table to render correct inputs */}
                        <MemoryTable
                            data={data}
                            editedNotes={editedNotes}
                            onNoteChange={handleNoteChange}
                            // Persistence Props
                            sorting={sorting}
                            onSortingChange={setSorting}
                            columnFilters={columnFilters}
                            onColumnFiltersChange={setColumnFilters}
                            columnVisibility={columnVisibility}
                            onColumnVisibilityChange={setColumnVisibility}
                            columnSizing={columnSizing}
                            onColumnSizingChange={setColumnSizing}
                        />
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
