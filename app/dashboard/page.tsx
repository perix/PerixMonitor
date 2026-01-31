'use client';

import { DashboardCharts } from "@/components/dashboard/DashboardCharts"; // Will update this component
import { PanelHeader } from "@/components/layout/PanelHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePortfolio } from "@/context/PortfolioContext";
import { ArrowUpRight, Euro, Wallet, Activity, Loader2 } from "lucide-react";
import { formatSwissMoney } from "@/lib/utils";
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
    const [filteredSummary, setFilteredSummary] = useState<any>(null); // State for filtered subset
    const [portfolioName, setPortfolioName] = useState("");

    const [initialSettings, setInitialSettings] = useState<any>(null);

    // Debounced update function
    const updateSettings = async (newSettings: any) => {
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

            // [PERSISTENCE] Load saved selection
            const savedSelection = localStorage.getItem(`dashboard_selection_${selectedPortfolioId}`);
            let initialSelection: Set<string> | null = null;
            if (savedSelection) {
                try {
                    initialSelection = new Set(JSON.parse(savedSelection));
                } catch (e) {
                    console.error("Failed to parse saved selection", e);
                }
            }

            // Check Cache
            if (dashboardCache[selectedPortfolioId]) {
                const cached = dashboardCache[selectedPortfolioId];
                setSummary(cached.summary);
                setHistory(cached.history);
                setInitialSettings(cached.settings);

                if (cached.name) {
                    setPortfolioName(cached.name);
                } else if (portfolioCache[selectedPortfolioId]) {
                    setPortfolioName(portfolioCache[selectedPortfolioId].name);
                }

                // Restore selected assets logic
                if (cached.history?.series) {
                    const allIsins = new Set<string>(cached.history.series.map((s: any) => s.isin));

                    // Use saved selection if available, intersect with current available assets to be safe
                    if (initialSelection) {
                        const validSelection = new Set<string>();
                        initialSelection.forEach(isin => {
                            if (allIsins.has(isin)) validSelection.add(isin);
                        });
                        // If intersection is empty (e.g. all selected assets deleted), fallback to all? 
                        // Or just empty? User might have deselected all.
                        // Let's rely on saved state unless it's completely alien.
                        // Actually, if user deselected everything, validSelection is empty. That's fine.
                        // But if initialSelection was valid but assets changed, we want to keep valid ones.
                        setSelectedAssets(validSelection);
                    } else {
                        // Default to ALL selected
                        setSelectedAssets(allIsins);
                    }
                }

                setLoading(false);
                return;
            }

            setLoading(true);
            try {
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
                setInitialSettings(settings);

                if (dataHistory.series) {
                    const allIsins = new Set<string>(dataHistory.series.map((s: any) => s.isin));

                    if (initialSelection) {
                        const validSelection = new Set<string>();
                        initialSelection.forEach(isin => {
                            if (allIsins.has(isin)) validSelection.add(isin);
                        });
                        setSelectedAssets(validSelection);
                    } else {
                        setSelectedAssets(allIsins);
                    }
                }

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

    // [PERSISTENCE] Save selection on change
    useEffect(() => {
        if (selectedPortfolioId && selectedAssets) {
            // We only save if we have data loaded (to avoid saving empty set on initial render before fetch)
            // But selectedAssets is init to empty set.
            // We should check if history is loaded.
            if (history?.series) {
                localStorage.setItem(`dashboard_selection_${selectedPortfolioId}`, JSON.stringify(Array.from(selectedAssets)));
            }
        }
    }, [selectedAssets, selectedPortfolioId, history]);

    const [subsetHistory, setSubsetHistory] = useState<any>(null);

    const filteredHistory = useMemo(() => {
        if (!history || !history.series) return history;

        const totalAssetsCount = history.series.length;
        const selectedCount = selectedAssets.size;
        const isSubset = selectedCount > 0 && selectedCount < totalAssetsCount;

        if (!isSubset) {
            return history;
        }

        const filteredSeries = history.series.filter((s: any) => selectedAssets.has(s.isin));

        // Use fetched subset history portfolio if available
        let portfolioLine = [];
        if (subsetHistory && subsetHistory.portfolio) {
            portfolioLine = subsetHistory.portfolio;
        } else {
            // Fallback: Compute Synthetic Portfolio (Sum of Market Values) locally
            // This ensures 'Controvalore' chart is correct immediately
            const dateMap = new Map<string, { date: string, value: number, market_value: number, pnl: number }>();

            filteredSeries.forEach((s: any) => {
                s.data.forEach((d: any) => {
                    if (!dateMap.has(d.date)) {
                        dateMap.set(d.date, { date: d.date, value: 0, market_value: 0, pnl: 0 });
                    }
                    const entry = dateMap.get(d.date)!;
                    entry.market_value += (d.market_value || 0);
                    entry.pnl += (d.pnl || 0);
                });
            });

            portfolioLine = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
        }

        return {
            ...history,
            series: filteredSeries,
            portfolio: portfolioLine
        };
    }, [history, selectedAssets, subsetHistory]);

    // Effect to fetch filtered summary and history when selection changes
    useEffect(() => {
        if (!selectedPortfolioId || !history?.series) return;

        const totalAssetsCount = history.series.length;
        const selectedCount = selectedAssets.size;

        if (selectedCount === 0 || selectedCount === totalAssetsCount) {
            setFilteredSummary(null);
            setSubsetHistory(null);
            return;
        }

        // Reset subset history to rely on synthetic calculation while fetching
        setSubsetHistory(null);

        const fetchFiltered = async () => {
            try {
                const assetsParam = Array.from(selectedAssets).join(',');
                const [resSum, resHist] = await Promise.all([
                    axios.get(`/api/dashboard/summary?portfolio_id=${selectedPortfolioId}&assets=${assetsParam}`),
                    axios.get(`/api/dashboard/history?portfolio_id=${selectedPortfolioId}&assets=${assetsParam}`)
                ]);
                setFilteredSummary(resSum.data);
                setSubsetHistory(resHist.data);
            } catch (e) {
                console.error("Error fetching filtered data", e);
            }
        };

        const timeoutId = setTimeout(fetchFiltered, 500); // 500ms debounce
        return () => clearTimeout(timeoutId);

    }, [selectedAssets, selectedPortfolioId, history]);


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
                <div className="grid gap-3" style={{ gridTemplateColumns: "minmax(0, 0.8fr) minmax(0, 0.8fr) minmax(0, 0.8fr) minmax(0, 1.6fr)" }}>
                    <Card className="bg-card/80 backdrop-blur-xl border-white/40 shadow-lg hover:bg-card/90 transition-colors">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Controvalore Portafoglio</CardTitle>
                            <Euro className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">€{formatSwissMoney(summary.total_value)}</div>
                            <p className="text-xs text-muted-foreground">
                                {summary.pl_percent >= 0 ? '+' : ''}{summary.pl_percent}% P&L
                            </p>
                            {filteredSummary && (
                                <div className="mt-2 pt-2 border-t border-white/10">
                                    <div className="text-sm font-semibold text-muted-foreground">
                                        €{formatSwissMoney(filteredSummary.total_value)}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground/70">
                                        Selezione
                                    </p>
                                </div>
                            )}
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
                            {filteredSummary && (
                                <div className="mt-2 pt-2 border-t border-white/10">
                                    <div className={`text-sm font-semibold ${filteredSummary.xirr >= 0 ? 'text-green-500/80' : 'text-red-500/80'}`}>
                                        {filteredSummary.xirr}%
                                    </div>
                                    <p className="text-[10px] text-muted-foreground/70">
                                        Selezione
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                    <Card className="bg-card/80 backdrop-blur-xl border-white/40 shadow-lg hover:bg-card/90 transition-colors">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Profitto / Perdita</CardTitle>
                            <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className={`text-2xl font-bold ${summary.pl_value >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                €{formatSwissMoney(summary.pl_value)}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Rispetto al capitale investito
                            </p>
                            {filteredSummary && (
                                <div className="mt-2 pt-2 border-t border-white/10">
                                    <div className={`text-sm font-semibold ${filteredSummary.pl_value >= 0 ? 'text-green-500/80' : 'text-red-500/80'}`}>
                                        €{formatSwissMoney(filteredSummary.pl_value)}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground/70">
                                        Selezione
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                    <Card className="bg-card/80 backdrop-blur-xl border-white/40 shadow-lg hover:bg-card/90 transition-colors gap-0">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Asset in Portafoglio</CardTitle>
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
                                <div className="flex h-full gap-4">
                                    {/* Asset Types List (Left) */}
                                    <div className="w-1/3 border-r border-white/10 pr-2 flex flex-col gap-1">
                                        <div className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Tipologie</div>
                                        {Array.from(new Set((history.series || []).map((s: any) => s.type || "Altro")))
                                            .sort((a: any, b: any) => b.localeCompare(a))
                                            .map((type: any) => {
                                                const assetsOfType = (history.series || []).filter((s: any) => (s.type || "Altro") === type);
                                                const allSelected = assetsOfType.every((s: any) => selectedAssets.has(s.isin));
                                                const someSelected = assetsOfType.some((s: any) => selectedAssets.has(s.isin));

                                                // Count selected / total
                                                const countSelected = assetsOfType.filter((s: any) => selectedAssets.has(s.isin)).length;

                                                return (
                                                    <div key={type} className="flex items-center space-x-2 py-1 hover:bg-white/5 rounded px-1 transition-colors">
                                                        <Checkbox
                                                            id={`type-${type}`}
                                                            checked={allSelected ? true : (someSelected ? "indeterminate" : false)}
                                                            onCheckedChange={(checked) => {
                                                                const next = new Set(selectedAssets);
                                                                assetsOfType.forEach((s: any) => {
                                                                    if (checked) {
                                                                        next.add(s.isin);
                                                                    } else {
                                                                        next.delete(s.isin);
                                                                    }
                                                                });
                                                                setSelectedAssets(next);
                                                            }}
                                                            className="border-white/50 data-[state=checked]:bg-primary"
                                                        />
                                                        <label
                                                            htmlFor={`type-${type}`}
                                                            className="text-xs font-medium cursor-pointer flex-1 truncate"
                                                            title={type}
                                                            onClick={(e) => {
                                                                // Optional: Click label to ISOLATE (Select ONLY this type)
                                                                e.preventDefault();
                                                                const next = new Set<string>();
                                                                assetsOfType.forEach((s: any) => next.add(s.isin));
                                                                setSelectedAssets(next);
                                                            }}
                                                        >
                                                            {type} <span className="opacity-50 text-[10px]">({countSelected}/{assetsOfType.length})</span>
                                                        </label>
                                                    </div>
                                                );
                                            })}
                                    </div>

                                    {/* Assets List (Right) */}
                                    <div className="w-2/3 flex flex-col gap-1 pl-1">
                                        {/* Helper function to render list */}
                                        {(() => {
                                            const activeIsins = new Set(summary?.allocation?.map((a: any) => a.isin) || []);
                                            const allSeries = (history.series || []);

                                            const activeAssets = allSeries.filter((s: any) => activeIsins.has(s.isin));
                                            const historicalAssets = allSeries.filter((s: any) => !activeIsins.has(s.isin));

                                            const renderAssetRow = (s: any, idx: number) => (
                                                <div key={s.isin} className="flex items-center space-x-2 py-0.5">
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
                                                        className="border-2 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground h-4 w-4"
                                                        style={{
                                                            borderColor: s.color || COLORS[idx % COLORS.length],
                                                            backgroundColor: selectedAssets.has(s.isin) ? (s.color || COLORS[idx % COLORS.length]) : 'transparent'
                                                        }}
                                                    />
                                                    <label
                                                        htmlFor={`filter-${s.isin}`}
                                                        className={`text-xs font-medium leading-none cursor-pointer w-full text-left ${activeIsins.has(s.isin) ? '' : 'text-muted-foreground italic'}`}
                                                        title={`${s.name} (${s.isin}) ${!activeIsins.has(s.isin) ? '- Sold' : ''}`}
                                                        style={{ color: activeIsins.has(s.isin) ? (s.color || COLORS[idx % COLORS.length]) : undefined }}
                                                    >
                                                        <div className="truncate w-full flex justify-between">
                                                            <span>{s.name}</span>
                                                            {!activeIsins.has(s.isin) && <span className="text-[9px] opacity-70 ml-1 px-1 bg-white/10 rounded">STORICO</span>}
                                                        </div>
                                                    </label>
                                                </div>
                                            );

                                            return (
                                                <>
                                                    {activeAssets.length > 0 && (
                                                        <>
                                                            <div className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wider sticky top-0 bg-background/95 backdrop-blur z-10">Attivi</div>
                                                            {activeAssets
                                                                .sort((a: any, b: any) => a.name.localeCompare(b.name))
                                                                .map((s: any, i: number) => renderAssetRow(s, i))}
                                                        </>
                                                    )}

                                                    {historicalAssets.length > 0 && (
                                                        <>
                                                            <div className="text-[10px] font-semibold text-muted-foreground mb-1 mt-2 uppercase tracking-wider sticky top-0 bg-background/95 backdrop-blur z-10">Storici (Venduti)</div>
                                                            {historicalAssets
                                                                .sort((a: any, b: any) => a.name.localeCompare(b.name))
                                                                .map((s: any, i: number) => renderAssetRow(s, i + activeAssets.length))}
                                                        </>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
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
                            initialSettings={initialSettings}
                            onSettingsChange={updateSettings}
                            portfolioName={portfolioName}
                        />
                    </div>
                </div>
            </div>
        </div >
    );
}
