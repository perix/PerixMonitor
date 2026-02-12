"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { usePortfolio } from "@/context/PortfolioContext";
import { Card, CardContent } from "@/components/ui/card";
import { MemoryTable } from "@/components/memory/MemoryTable";
import { Loader2, Save } from "lucide-react";
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

    // Sync Settings to Local State
    useEffect(() => {
        if (settings) {
            setSorting(settings.sorting || []);
            setColumnFilters(settings.columnFilters || []);
            setColumnVisibility(settings.columnVisibility || {});
            setColumnSizing(settings.columnSizing || {});
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
                    columnSizing
                }
            });
        }, 1000); // 1 sec debounce

        return () => clearTimeout(timer);
    }, [sorting, columnFilters, columnVisibility, columnSizing, userId, selectedPortfolioId]);

    // Editing State
    const [editedNotes, setEditedNotes] = useState<Record<string, string>>({});

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
                        />
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
