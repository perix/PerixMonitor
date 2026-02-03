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

interface DashboardSummary {
    total_value: number;
    total_invested: number;
    pl_value: number;
    pl_percent: number;
    xirr: number;
    mwr_type: string;
    allocation: any[];
}

interface DashboardHistory {
    series: any[];
    portfolio: any[];
    settings?: any;
    requestParams?: any;
    name?: string;
}

export default function DashboardPage() {
    const { selectedPortfolioId, dashboardCache, setDashboardCache, portfolioCache } = usePortfolio();

    const [summary, setSummary] = useState<any>(null);
    const [history, setHistory] = useState<any>(null);
    const [loading, setLoading] = useState(false); // Changed default to false to prevent infinite spin on logic gap
    const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
    const [filteredSummary, setFilteredSummary] = useState<any>(null); // State for filtered subset
    const [portfolioName, setPortfolioName] = useState("");

    const [initialSettings, setInitialSettings] = useState<any>(null);

    const [mwrT1, setMwrT1] = useState(30); // Effective T1 for API
    const [mwrT2, setMwrT2] = useState(365); // Effective T2 for API

    const [inputT1, setInputT1] = useState("30"); // UI Input State
    const [inputT2, setInputT2] = useState("365"); // UI Input State

    const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);

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

    // [PERSISTENCE] Fetch Settings SEPARATELY on load/portfolio change
    useEffect(() => {
        if (!selectedPortfolioId) return;

        // Reset loading state for settings
        setIsSettingsLoaded(false);

        const fetchSettings = async () => {
            // Check cache first for settings?
            if (dashboardCache[selectedPortfolioId]?.settings) {
                const s = dashboardCache[selectedPortfolioId].settings;
                if (s) {
                    if (s.mwr_t1) {
                        setMwrT1(s.mwr_t1);
                        setInputT1(s.mwr_t1.toString());
                    }
                    if (s.mwr_t2) {
                        setMwrT2(s.mwr_t2);
                        setInputT2(s.mwr_t2.toString());
                    }
                    setInitialSettings(s);
                }
                setIsSettingsLoaded(true);
                return;
            }

            try {
                const res = await axios.get(`/api/portfolio/${selectedPortfolioId}`);
                const s = res.data.settings || {};
                if (s.mwr_t1) {
                    setMwrT1(s.mwr_t1);
                    setInputT1(s.mwr_t1.toString());
                }
                if (s.mwr_t2) {
                    setMwrT2(s.mwr_t2);
                    setInputT2(s.mwr_t2.toString());
                }
                setInitialSettings(s);
            } catch (e) {
                console.error("Settings fetch error", e);
            } finally {
                setIsSettingsLoaded(true);
            }
        };
        fetchSettings();
    }, [selectedPortfolioId]);

    // [PERSISTENCE] Auto-Save Settings on Change (Debounced)
    const handleCommitSettings = () => {
        const t1 = parseInt(inputT1) || 30;
        const t2 = parseInt(inputT2) || 365;

        console.log("[DEBUG] Committing settings:", { prevT1: mwrT1, newT1: t1, prevT2: mwrT2, newT2: t2 });

        // Only update if changed
        if (t1 !== mwrT1 || t2 !== mwrT2) {
            setMwrT1(t1);
            setMwrT2(t2);
            // Update initialSettings locally to keep sync for cache
            setInitialSettings((prev: any) => ({ ...prev, mwr_t1: t1, mwr_t2: t2 }));
            // Save immediately on commit
            updateSettings({ mwr_t1: t1, mwr_t2: t2 });
        }
    };

    useEffect(() => {
        async function fetchData() {
            console.log("[DEBUG] fetchData triggered", { selectedPortfolioId, mwrT1, mwrT2, isSettingsLoaded });

            if (!selectedPortfolioId) {
                setLoading(false);
                setSummary(null);
                setHistory([]);
                return;
            }

            // Wait for settings to load to avoid fetching with defaults then reloading
            if (!isSettingsLoaded) {
                setLoading(true); // Show loading while waiting for settings
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

            // Check Cache - SKIP if MWR params changed (simplification: just refetch for now if we change params, 
            // but for initial load cache is fine if we assume defaults. 
            // Better: invalidate cache if T1/T2 change? 
            // For now, let's allow fetching fresh if we interact with params.
            // But here is the initial load.
            // Check Cache
            // We must now ensure T1/T2 from cache matches current requested T1/T2
            if (dashboardCache[selectedPortfolioId]) {
                const cached = dashboardCache[selectedPortfolioId];

                // Compare cached T1/T2 with current state
                // If stored in cache settings or similar
                const cachedT1 = cached.requestParams?.mwrT1;
                const cachedT2 = cached.requestParams?.mwrT2;

                // If params match (or cache is old/generic but we accept it for first load), use it.
                // But better to be strict if we want T1/T2 updates to work.
                if (cachedT1 === mwrT1 && cachedT2 === mwrT2) {
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

                    setLoading(false);
                    return;
                }
                // If mismatch, proceed to fetch
            }

            // If mismatch, proceed to fetch

            setLoading(true);
            console.log("[DEBUG] Starting API fetch...", { mwrT1, mwrT2 });
            try {
                // Remove redundant settings fetch to optimize
                const [resSummary, resHistory] = await Promise.all([
                    axios.get(`/api/dashboard/summary?portfolio_id=${selectedPortfolioId}&mwr_t1=${mwrT1}&mwr_t2=${mwrT2}`),
                    axios.get(`/api/dashboard/history?portfolio_id=${selectedPortfolioId}&mwr_t1=${mwrT1}&mwr_t2=${mwrT2}`)
                ]);

                const dataSummary = resSummary.data;
                const dataHistory = resHistory.data;
                // Settings already loaded
                // e.g. setInitialSettings(settings) - likely redundant but harmless if we want to ensure sync

                // Fetch name if missing (or use Cache/Context)
                if (!portfolioName) {
                    // Quick fetch for name if needed, or rely on portfolioCache
                    // We can optimistically set name from portfolioCache if available
                    if (portfolioCache[selectedPortfolioId]) {
                        setPortfolioName(portfolioCache[selectedPortfolioId].name);
                    } else {
                        // Fallback fetch
                        axios.get(`/api/portfolio/${selectedPortfolioId}`).then(res => setPortfolioName(res.data.name));
                    }
                }

                setSummary(dataSummary);
                setHistory(dataHistory);

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
                    settings: initialSettings,
                    name: portfolioName, // Use current state or cached
                    requestParams: { mwrT1, mwrT2 }
                });

            } catch (e) {
                console.error("Dashboard fetch error:", e);
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, [selectedPortfolioId, mwrT1, mwrT2, isSettingsLoaded]); // Refetch when T1/T2 change OR settings loaded

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

        // CASE 1: No assets selected -> Show Nothing (Empty Chart)
        if (selectedCount === 0) {
            return {
                series: [],
                portfolio: history.portfolio.map((d: any) => ({ ...d, value: 0, market_value: 0, pnl: 0 }))
            };
        }

        const isSubset = selectedCount < totalAssetsCount;

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
            // But for MWR, we can't easily sum. We just show empty or sum.
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

        if (selectedCount === totalAssetsCount) {
            setFilteredSummary(null);
            setSubsetHistory(null);
            return;
        }

        if (selectedCount === 0) {
            // Manually set zeroed summary
            setFilteredSummary({
                total_value: 0,
                total_invested: 0,
                pl_value: 0,
                pl_percent: 0,
                xirr: 0,
                allocation: []
            });
            setSubsetHistory({ series: [], portfolio: [] });
            return;
        }

        // Reset subset history to rely on synthetic calculation while fetching
        setSubsetHistory(null);

        const fetchFiltered = async () => {
            try {
                const assetsParam = Array.from(selectedAssets).join(',');
                const [resSum, resHist] = await Promise.all([
                    axios.get(`/api/dashboard/summary?portfolio_id=${selectedPortfolioId}&assets=${assetsParam}&mwr_t1=${mwrT1}&mwr_t2=${mwrT2}`),
                    axios.get(`/api/dashboard/history?portfolio_id=${selectedPortfolioId}&assets=${assetsParam}&mwr_t1=${mwrT1}&mwr_t2=${mwrT2}`)
                ]);
                setFilteredSummary(resSum.data);
                setSubsetHistory(resHist.data);
            } catch (e) {
                console.error("Error fetching filtered data", e);
            }
        };

        const timeoutId = setTimeout(fetchFiltered, 500); // 500ms debounce
        return () => clearTimeout(timeoutId);

    }, [selectedAssets, selectedPortfolioId, history, mwrT1, mwrT2]); // Added mwr params


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

    // UI Helpers
    const getMwrLabel = (type: string) => {
        switch (type) {
            case "SIMPLE": return "Simple Return (< T1)";
            case "PERIOD": return "Period Value (< T2)";
            case "ANNUAL": return "XIRR Annualizzato";
            default: return "MWR";
        }
    };

    return (

        <div className="flex flex-1 flex-col h-full bg-background/50 p-6 overflow-hidden">
            <PanelHeader title={`Dashboard - ${portfolioName || 'Loading...'}`}>
                <div className="flex items-center gap-2 text-xs">
                    <div className="flex items-center gap-1 bg-background/50 border border-white/10 rounded px-2 py-1">
                        <span className="text-muted-foreground whitespace-nowrap">T1 (Simple)</span>
                        <input
                            type="number"
                            className="w-12 h-6 bg-transparent border-none text-center focus:ring-0 appearance-none"
                            value={inputT1}
                            onChange={(e) => setInputT1(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleCommitSettings(); }}
                            onBlur={handleCommitSettings}
                        />
                        <span className="text-muted-foreground">gg</span>
                    </div>
                    <div className="flex items-center gap-1 bg-background/50 border border-white/10 rounded px-2 py-1">
                        <span className="text-muted-foreground whitespace-nowrap">T2 (Period)</span>
                        <input
                            type="number"
                            className="w-12 h-6 bg-transparent border-none text-center focus:ring-0 appearance-none"
                            value={inputT2}
                            onChange={(e) => setInputT2(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleCommitSettings(); }}
                            onBlur={handleCommitSettings}
                        />
                        <span className="text-muted-foreground">gg</span>
                    </div>
                </div>
            </PanelHeader>

            <div className="flex flex-col gap-3 flex-1 min-h-0">
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
                                {getMwrLabel(summary.mwr_type)}
                            </p>
                            {filteredSummary && (
                                <div className="mt-2 pt-2 border-t border-white/10">
                                    <div className={`text-sm font-semibold ${filteredSummary.xirr >= 0 ? 'text-green-500/80' : 'text-red-500/80'}`}>
                                        {filteredSummary.xirr}%
                                    </div>
                                    <p className="text-[10px] text-muted-foreground/70">
                                        {getMwrLabel(filteredSummary.mwr_type || summary.mwr_type)}
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

                <div className="flex-1 min-h-0 flex flex-col">
                    {/* 
                         MODIFIED: Full width graph as requested.
                         Removed the side allocation panel.
                         The NetWorthChart will be replaced/updated to show MWR of assets.
                     */}
                    <div className="flex-1 min-h-0">
                        <DashboardCharts
                            allocationData={summary.allocation}
                            history={filteredHistory}
                            initialSettings={initialSettings}
                            onSettingsChange={updateSettings}
                            portfolioName={portfolioName}
                            className="h-full"
                        />
                    </div>
                </div>
            </div>
        </div >
    );
}
