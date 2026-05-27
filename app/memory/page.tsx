"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { usePortfolio } from "@/context/PortfolioContext";
import { Card, CardContent } from "@/components/ui/card";
import { MemoryTable } from "@/components/memory/MemoryTable";
import { Loader2, Save, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";
import { SortingState, ColumnFiltersState, VisibilityState } from "@tanstack/react-table";
import { useMemoryData, useMemorySettings, useUpdateMemoryNotesBatch, useUpdateMemorySettings } from "@/hooks/useMemory";
import { usePortfolioDetails } from "@/hooks/useDashboard";
import axios from "axios";

export default function MemoryPage() {
    const { selectedPortfolioId } = usePortfolio();

    // Auth State
    const [userId, setUserId] = useState<string | null>(null);
    const supabase = createClient();

    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) setUserId(user.id);
        };
        getUser();
    }, []);

    // --- Queries ---
    const { data: memoryData, isLoading: isLoadingData, error: dataError } = useMemoryData(selectedPortfolioId);
    const { data: portfolioDetails } = usePortfolioDetails(selectedPortfolioId);

    // Settings Query
    const { data: settings } = useMemorySettings(selectedPortfolioId, userId);

    // --- Mutations ---
    const updateSettingsMutation = useUpdateMemorySettings();
    const updateNotesMutation = useUpdateMemoryNotesBatch();

    // --- Local State ---
    // Table State
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
    const [columnSizing, setColumnSizing] = useState<Record<string, number>>({});
    const [selectedTrend, setSelectedTrend] = useState<string>("ALL");

    // Sync Settings to Local State
    useEffect(() => {
        if (settings) {
            setSorting(settings.sorting || []);
            setColumnFilters(settings.columnFilters || []);
            setColumnVisibility(settings.columnVisibility || {});
            setColumnSizing(settings.columnSizing || {});
            if (settings.selectedTrend) setSelectedTrend(settings.selectedTrend);
        }
    }, [settings]);

    // Auto-Save Settings
    useEffect(() => {
        if (!settings || !userId || !selectedPortfolioId) return;

        const timer = setTimeout(() => {
            updateSettingsMutation.mutate({
                portfolioId: selectedPortfolioId,
                userId,
                settings: {
                    sorting,
                    columnFilters,
                    columnVisibility,
                    columnSizing,
                    selectedTrend
                }
            });
        }, 1000); // 1 sec debounce

        return () => clearTimeout(timer);
    }, [sorting, columnFilters, columnVisibility, columnSizing, selectedTrend, userId, selectedPortfolioId]);

    // Editing State
    const [editedNotes, setEditedNotes] = useState<Record<string, string>>({});
    const [exporting, setExporting] = useState(false);

    const handleNoteChange = useCallback((id: string, value: string) => {
        setEditedNotes(prev => ({ ...prev, [id]: value }));
    }, []);

    const handleGlobalSave = () => {
        if (!selectedPortfolioId || Object.keys(editedNotes).length === 0) return;

        updateNotesMutation.mutate({
            portfolioId: selectedPortfolioId,
            notes: editedNotes
        }, {
            onSuccess: () => {
                setEditedNotes({});
            },
            onError: () => {
                alert("Errore durante il salvataggio");
            }
        });
    };

    const handleExportExcel = async () => {
        if (!selectedPortfolioId) return;
        setExporting(true);
        try {
            const res = await fetch(`/api/export/memory?portfolio_id=${selectedPortfolioId}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const cd = res.headers.get('Content-Disposition') || '';
            const match = cd.match(/filename="?([^"]+)"?/);
            a.download = match ? match[1] : `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_Portfolio_${portfolioName}.xlsx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (e: any) {
            console.error("Export failed", e);
            alert("Errore durante l'esportazione: " + e.message);
        } finally {
            setExporting(false);
        }
    };

    const hasChanges = Object.keys(editedNotes).length > 0;
    const isSaving = updateNotesMutation.isPending;
    const portfolioName = portfolioDetails?.name || "Portafoglio";

    if (!selectedPortfolioId) {
        return (
            <div className="flex flex-col items-center justify-center p-8 space-y-4">
                <h2 className="text-xl font-semibold">Seleziona un portafoglio</h2>
                <p className="text-muted-foreground">Devi selezionare un portafoglio per visualizzare lo storico.</p>
            </div>
        )
    }

    return (
        <div className="pl-1 pr-4 py-1 space-y-0 h-[calc(100vh-2rem)] flex flex-col">
            <div className="flex items-center justify-between flex-shrink-0">
                <div className="flex flex-col space-y-1">
                    <h1 className="text-2xl font-bold tracking-tight">Note & Storico - {portfolioName}</h1>
                    <p className="text-muted-foreground text-sm">
                        Lista Asset, date, P&L e Note dell'utente.
                    </p>
                </div>

                {/* Global Save & Export Buttons */}
                <div className="flex items-center gap-2">
                    {hasChanges && (
                        <span className="text-sm text-amber-600 animate-pulse">
                            Modifiche non salvate
                        </span>
                    )}
                    <Button
                        onClick={handleExportExcel}
                        disabled={exporting}
                        variant="outline"
                        className="border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-300 gap-2"
                    >
                        {exporting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Download className="h-4 w-4" />
                        )}
                        Esporta Excel
                    </Button>
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

            {isLoadingData ? (
                <div className="flex justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : dataError ? (
                <div className="p-4 border border-red-200 bg-red-50 text-red-800 rounded-md">
                    Errore: {dataError instanceof Error ? dataError.message : "Errore sconosciuto"}
                </div>
            ) : (
                <Card className="flex-1 flex flex-col overflow-hidden border-0 shadow-none min-h-0">
                    <CardContent className="flex-1 flex flex-col p-0 pt-2 min-h-0">
                        <MemoryTable
                            data={memoryData || []}
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
                            portfolioId={selectedPortfolioId}
                            selectedTrend={selectedTrend}
                            onTrendChange={setSelectedTrend}
                        />
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
