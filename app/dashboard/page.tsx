'use client';

import { DashboardCharts } from "@/components/dashboard/DashboardCharts"; // Will update this component
import { PanelHeader } from "@/components/layout/PanelHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePortfolio } from "@/context/PortfolioContext";
import { ArrowUpRight, DollarSign, Wallet, Activity, Loader2 } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import axios from "axios";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

const COLORS = ['#0ea5e9', '#22c55e', '#eab308', '#f97316', '#a855f7', '#ec4899', '#6366f1', '#14b8a6'];

export default function DashboardPage() {
    const { selectedPortfolioId } = usePortfolio();

    const [summary, setSummary] = useState<any>(null);
    const [history, setHistory] = useState<any>([]);
    const [loading, setLoading] = useState(true);
    const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());

    useEffect(() => {
        async function fetchData() {
            if (!selectedPortfolioId) return;

            setLoading(true);
            try {
                const [resSummary, resHistory] = await Promise.all([
                    axios.get(`/api/dashboard/summary?portfolio_id=${selectedPortfolioId}`),
                    axios.get(`/api/dashboard/history?portfolio_id=${selectedPortfolioId}`)
                ]);

                setSummary(resSummary.data);
                setHistory(resHistory.data); // Now contains { series: [], portfolio: [] }

                // Initialize selection with ALL assets
                if (resHistory.data?.series) {
                    const allIsins = new Set<string>(resHistory.data.series.map((s: any) => s.isin));
                    setSelectedAssets(allIsins);
                }

            } catch (e) {
                console.error("Dashboard fetch error:", e);
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, [selectedPortfolioId]);

    const filteredHistory = useMemo(() => {
        if (!history || !history.series) return history;
        return {
            ...history,
            series: history.series.filter((s: any) => selectedAssets.has(s.isin))
        };
    }, [history, selectedAssets]);

    if (loading) {
        return <div className="flex h-full items-center justify-center p-8"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;
    }

    if (!summary) {
        return (
            <div className="text-center p-8">
                <h2 className="text-xl font-semibold">Nessun dato disponibile</h2>
                <p className="text-muted-foreground">Seleziona un portafoglio o carica dei dati.</p>
            </div>
        );
    }

    return (

        <div className="flex flex-1 flex-col h-full bg-background/50 p-6">
            <PanelHeader title="Dashboard" />

            <div className="flex flex-col gap-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Card className="bg-card/80 backdrop-blur-xl border-white/20 shadow-lg hover:bg-card/90 transition-colors">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Patrimonio Totale</CardTitle>
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">€{summary.total_value?.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                            <p className="text-xs text-muted-foreground">
                                {summary.pl_percent >= 0 ? '+' : ''}{summary.pl_percent}% P&L
                            </p>
                        </CardContent>
                    </Card>
                    <Card className="bg-card/80 backdrop-blur-xl border-white/20 shadow-lg hover:bg-card/90 transition-colors">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">MWR (Money Weighted Return)</CardTitle>
                            <Activity className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className={`text-2xl font-bold ${summary.xirr >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {summary.xirr}%
                            </div>
                            <p className="text-xs text-muted-foreground">
                                XIRR Annualizzato
                            </p>
                        </CardContent>
                    </Card>
                    <Card className="bg-card/80 backdrop-blur-xl border-white/20 shadow-lg hover:bg-card/90 transition-colors">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Profitto / Perdita</CardTitle>
                            <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className={`text-2xl font-bold ${summary.pl_value >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                €{summary.pl_value?.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Rispetto al capitale investito
                            </p>
                        </CardContent>
                    </Card>
                    <Card className="bg-card/80 backdrop-blur-xl border-white/20 shadow-lg hover:bg-card/90 transition-colors">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Asset Attivi</CardTitle>
                            <Wallet className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold mb-1">{summary.allocation?.length || 0}</div>
                            <p className="text-xs text-muted-foreground mb-4">
                                Strumenti in portafoglio
                            </p>

                            <ScrollArea className="h-[120px] w-full rounded border border-white/10 bg-black/20 p-2">
                                <div className="flex flex-col gap-2">
                                    {history.series?.map((s: any, idx: number) => (
                                        <div key={s.isin} className="flex items-center space-x-2">
                                            <Checkbox
                                                id={`filter-${s.isin}`}
                                                checked={selectedAssets.has(s.isin)}
                                                onCheckedChange={(checked) => {
                                                    const next = new Set(selectedAssets);
                                                    if (checked) {
                                                        next.add(s.isin);
                                                    } else {
                                                        next.delete(s.isin);
                                                    }
                                                    setSelectedAssets(next);
                                                }}
                                                className="border-white/50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                                                style={{ borderColor: COLORS[idx % COLORS.length] }}
                                            />
                                            <label
                                                htmlFor={`filter-${s.isin}`}
                                                className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer truncate max-w-[150px]"
                                                title={s.name}
                                                style={{ color: COLORS[idx % COLORS.length] }}
                                            >
                                                {s.isin}
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid gap-4 md:grid-cols-1">
                    {/* 
                         MODIFIED: Full width graph as requested.
                         Removed the side allocation panel.
                         The NetWorthChart will be replaced/updated to show MWR of assets.
                     */}
                    <div className="col-span-1">
                        <DashboardCharts allocationData={summary.allocation} history={filteredHistory} />
                    </div>
                </div>
            </div>
        </div >
    );
}
