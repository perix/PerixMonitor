"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { useCertificates } from "@/hooks/useCertificates";
import { CertificatesTable } from "@/components/certificati/CertificatesTable";

export default function CertificatiPage() {
    // Master data globale: la lista NON dipende dal portafoglio selezionato.
    const { data, isLoading, error, isFetching, refetch } = useCertificates(true);

    return (
        <div className="pl-1 pr-4 py-1 space-y-0 h-[calc(100vh-2rem)] flex flex-col">
            <div className="flex items-center justify-between flex-shrink-0">
                <div className="flex flex-col space-y-1">
                    <h1 className="text-2xl font-bold tracking-tight">Certificati</h1>
                    <p className="text-muted-foreground text-sm">
                        Tutti i certificati analizzati e salvati in base dati. Distanza Worst-Of live (best-effort).
                    </p>
                </div>
                <Button
                    onClick={() => refetch()}
                    disabled={isFetching}
                    variant="outline"
                    className="border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-300 gap-2"
                >
                    {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Ricarica
                </Button>
            </div>

            {isLoading ? (
                <div className="flex justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : error ? (
                <div className="p-4 border border-red-200 bg-red-50 text-red-800 rounded-md">
                    Errore: {error instanceof Error ? error.message : "Errore sconosciuto"}
                </div>
            ) : (
                <Card className="flex-1 flex flex-col overflow-hidden border-0 shadow-none min-h-0 mt-2">
                    <CardContent className="flex-1 flex flex-col p-0 min-h-0 overflow-auto">
                        <CertificatesTable data={data || []} />
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
