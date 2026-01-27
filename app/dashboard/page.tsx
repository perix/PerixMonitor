'use client';

import { DashboardCharts } from "@/components/dashboard/DashboardCharts"; // Will update this component
import { PanelHeader } from "@/components/layout/PanelHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePortfolio } from "@/context/PortfolioContext";
import { ArrowUpRight, Euro, Wallet, Activity, Loader2 } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import axios from "axios";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

const COLORS = ['#0ea5e9', '#22c55e', '#eab308', '#f97316', '#a855f7', '#ec4899', '#6366f1', '#14b8a6'];

export default function DashboardPage() {
    const { selectedPortfolioId, dashboardCache, setDashboardCache, portfolioCache } = usePortfolio();

    const [summary, setSummary] = useState<any>(null);
    const [history, setHistory] = useState<any>([]);
    const [loading, setLoading] = useState(true);
    const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
    const [portfolioName, setPortfolioName] = useState("");

    const [initialSettings, setInitialSettings] = useState<{ timeWindow?: number, yAxisScale?: number } | null>(null);

    // Debounced update function
    const updateSettings = async (newSettings: { timeWindow?: number, yAxisScale?: number }) => {
        if (!selectedPortfolioId) return;
        try {
            await axios.patch(`/api/portfolio/${selectedPortfolioId}/settings`, newSettings);

            // Update cache optimistically
            if (dashboardCache[selectedPortfolioId]) {
                const currentCache = dashboardCache[selectedPortfolioId];
                setDashboardCache(selectedPortfolioId, {
                    ...currentCache,
                    settings: { ...currentCache.settings, ...newSettings }
                });
            }
        } catch (e) {
            console.error("Failed to update settings:", e);
        }
    };

    useEffect(() => {
        async function fetchData() {
            if (!selectedPortfolioId) {
                setLoading(false);
                setSummary(null);
                setHistory([]);
                return;
            }

            // Check Cache
            if (dashboardCache[selectedPortfolioId]) {
                const cached = dashboardCache[selectedPortfolioId];
                setSummary(cached.summary);
                setHistory(cached.history);
                setInitialSettings(cached.settings);

                // Restore name from cache
                if (cached.name) {
                    setPortfolioName(cached.name);
                } else if (portfolioCache[selectedPortfolioId]) {
                    // Fallback to portfolio cache if available
                    setPortfolioName(portfolioCache[selectedPortfolioId].name);
                }

                // Restore selected assets logic if needed, or just default to all if not cached separately
                // Ideally we might want to cache selectedAssets too, but for now re-init is fine
                // or we can infer it. 
                // Let's re-init selection based on history series for now to be safe.
                if (cached.history?.series) {
                    const allIsins = new Set<string>(cached.history.series.map((s: any) => s.isin));
                    setSelectedAssets(allIsins);
                }

                setLoading(false);
                return;
            }

            setLoading(true);
            try {
                // Fetch details to get settings (now included in /api/portfolio/:id)
                // Note: The previous code didn't fetch details separately here, but we need settings.
                // We can fetch details or just modify dashboard/summary to return settings?
                // The implementation plan said modifying dashboard/summary OR fetch details.
                // Let's make a separate call to details for clean separation or use the new patch route?
                // Actually, let's fetch details briefly.

                const [resSummary, resHistory, resDetails] = await Promise.all([
                    axios.get(`/api/dashboard/summary?portfolio_id=${selectedPortfolioId}`),
                    axios.get(`/api/dashboard/history?portfolio_id=${selectedPortfolioId}`),
                    axios.get(`/api/portfolio/${selectedPortfolioId}`)
                ]);

                const dataSummary = resSummary.data;
                const dataHistory = resHistory.data;
                const portfolioDetails = resDetails.data;
                const settings = portfolioDetails.settings || {};

                setSummary(dataSummary);
                setHistory(dataHistory);
                setPortfolioName(portfolioDetails.name);

                // Set initial settings if present
                setInitialSettings(settings);

                if (dataHistory.series) {
                    const allIsins = new Set<string>(dataHistory.series.map((s: any) => s.isin));
                    setSelectedAssets(allIsins);
                }

                // Update Cache
                setDashboardCache(selectedPortfolioId, {
                    summary: dataSummary,
                    history: dataHistory,
                    settings: settings,
                    name: portfolioDetails.name
                });

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

        <div className="flex flex-1 flex-col h-full bg-background/50 p-6 overflow-y-auto">
            <PanelHeader title={`Dashboard - ${portfolioName || 'Loading...'}`} />

            <div className="flex flex-col gap-3">
                <div className="grid gap-3" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.25fr)" }}>
                    <Card className="bg-card/80 backdrop-blur-xl border-white/40 shadow-lg hover:bg-card/90 transition-colors">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Patrimonio Totale</CardTitle>
                            <Euro className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">€{summary.total_value?.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                            <p className="text-xs text-muted-foreground">
                                {summary.pl_percent >= 0 ? '+' : ''}{summary.pl_percent}% P&L
                            </p>
                        </CardContent>
                    </Card>
                    <Card className="bg-card/80 backdrop-blur-xl border-white/40 shadow-lg hover:bg-card/90 transition-colors">
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
                    <Card className="bg-card/80 backdrop-blur-xl border-white/40 shadow-lg hover:bg-card/90 transition-colors">
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
                    <Card className="bg-card/80 backdrop-blur-xl border-white/40 shadow-lg hover:bg-card/90 transition-colors gap-0">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Asset Attivi</CardTitle>
                            <Wallet className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent className="pt-0">
                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-baseline gap-2">
                                    <div className="text-2xl font-bold">{summary.allocation?.length || 0}</div>
                                    <p className="text-xs text-muted-foreground">
                                        Strumenti in portafoglio
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <label
                                        htmlFor="filter-all-header"
                                        className="text-[10px] font-medium leading-none cursor-pointer text-muted-foreground text-right"
                                    >
                                        {history.series && selectedAssets.size === history.series.length
                                            ? "Tutti selezionati"
                                            : selectedAssets.size > 0
                                                ? "Alcuni selezionati"
                                                : "Nessuno selezionato"
                                        }
                                    </label>
                                    <Checkbox
                                        id="filter-all-header"
                                        checked={selectedAssets.size > 0}
                                        onCheckedChange={(checked) => {
                                            if (history.series) {
                                                if (selectedAssets.size > 0) {
                                                    setSelectedAssets(new Set());
                                                } else {
                                                    const allIsins = new Set<string>(history.series.map((s: any) => s.isin));
                                                    setSelectedAssets(allIsins);
                                                }
                                            }
                                        }}
                                        className="border-white/50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground h-4 w-4"
                                    />
                                </div>
                            </div>

                            <ScrollArea className="h-[160px] w-full rounded border border-white/10 bg-white/5 p-2 mt-3">
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
                                                style={{
                                                    borderColor: s.color || COLORS[idx % COLORS.length],
                                                    backgroundColor: selectedAssets.has(s.isin) ? (s.color || COLORS[idx % COLORS.length]) : 'transparent'
                                                }}
                                            />
                                            <label
                                                htmlFor={`filter-${s.isin}`}
                                                className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer w-full text-left"
                                                title={`${s.name} (${s.isin})`}
                                                style={{ color: s.color || COLORS[idx % COLORS.length] }}
                                            >
                                                <div className="truncate" style={{ width: 'calc(100% - 20px)' }}>
                                                    {s.name} <span className="text-[10px] opacity-70">({s.isin})</span>
                                                </div>
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid gap-3 md:grid-cols-1">
                    {/* 
                         MODIFIED: Full width graph as requested.
                         Removed the side allocation panel.
                         The NetWorthChart will be replaced/updated to show MWR of assets.
                     */}
                    <div className="col-span-1">
                        <DashboardCharts
                            allocationData={summary.allocation}
                            history={filteredHistory}
                            initialTimeWindow={initialSettings?.timeWindow}
                            initialYAxisScale={initialSettings?.yAxisScale}
                            onSettingsChange={updateSettings}
                        />
                    </div>
                </div>
            </div>
        </div >
    );
}
