'use client';

import { DashboardCharts } from "@/components/dashboard/DashboardCharts";
import { PanelHeader } from "@/components/layout/PanelHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePortfolio } from "@/context/PortfolioContext";
import { ArrowUpRight, Euro, Wallet, Activity, Loader2 } from "lucide-react";
import { formatSwissMoney, formatSwissNumber, getAccessibleColor } from "@/lib/utils";
import { useEffect, useState, useMemo, useRef } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDashboardSummary, useDashboardHistory, usePortfolioSettings, useUpdatePortfolioSettings, usePortfolioDetails } from "@/hooks/useDashboard";
import { useQueryClient } from "@tanstack/react-query";

const COLORS = ['#0ea5e9', '#22c55e', '#eab308', '#f97316', '#a855f7', '#ec4899', '#6366f1', '#14b8a6'];

export default function DashboardPage() {
    const { selectedPortfolioId } = usePortfolio();
    const queryClient = useQueryClient();

    // Portfolio Details (Name)
    const { data: portfolioDetails } = usePortfolioDetails(selectedPortfolioId);

    // --- State ---
    const [mwrT1, setMwrT1] = useState(30);
    const [mwrT2, setMwrT2] = useState(365);
    const [inputT1, setInputT1] = useState("30");
    const [inputT2, setInputT2] = useState("365");

    // Selection state
    const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());

    // Calculation Mode
    const [xirrMode, setXirrMode] = useState('standard');

    // Period Stats from Chart Slider
    const [periodStats, setPeriodStats] = useState<{ pnl: number; mwr: number; market_value: number; date: string; startDate?: string; isFullRange: boolean } | null>(null);

    // --- Queries ---

    // 1. Settings
    const { data: settings, isLoading: isLoadingSettings } = usePortfolioSettings(selectedPortfolioId);

    // 2. Data (Main)
    const { data: summary, isLoading: isLoadingSummary } = useDashboardSummary(selectedPortfolioId, mwrT1, mwrT2, undefined, xirrMode);
    const { data: history, isLoading: isLoadingHistory } = useDashboardHistory(selectedPortfolioId, mwrT1, mwrT2, undefined, xirrMode);

    // 3. Filtered Data (Only if selection exists and is not full)
    const isFullSelection = !history?.series || selectedAssets.size === history.series.length;

    // Prepare assets param for filtered query
    const selectedAssetsArray = useMemo(() => Array.from(selectedAssets), [selectedAssets]);

    const { data: filteredSummary, isLoading: isLoadingFilteredSummary } = useDashboardSummary(
        selectedPortfolioId,
        mwrT1,
        mwrT2,
        !isFullSelection ? selectedAssetsArray : undefined,
        xirrMode
    );

    const { data: filteredHistory, isLoading: isLoadingFilteredHistory } = useDashboardHistory(
        selectedPortfolioId,
        mwrT1,
        mwrT2,
        !isFullSelection ? selectedAssetsArray : undefined,
        xirrMode
    );

    // --- Mutations ---
    const updateSettingsMutation = useUpdatePortfolioSettings();

    // --- Effects ---

    // Initialization Locks: Prevent React Query continuous refetches from overwriting local state
    const initializedSettingsForPortfolioRef = useRef<string | null>(null);
    const autoFilledPortfolioRef = useRef<string | null>(null);

    // Sync Settings to State when loaded (ONCE per portfolio to prevent optimistic cache overwrites)
    useEffect(() => {
        if (settings && initializedSettingsForPortfolioRef.current !== selectedPortfolioId) {
            if (settings.mwr_t1) {
                setMwrT1(settings.mwr_t1);
                setInputT1(settings.mwr_t1.toString());
            }
            if (settings.mwr_t2) {
                setMwrT2(settings.mwr_t2);
                setInputT2(settings.mwr_t2.toString());
            }

            // Restore selection
            if (settings.dashboardSelection && Array.isArray(settings.dashboardSelection)) {
                setSelectedAssets(new Set(settings.dashboardSelection));
            } else {
                // If the user's settings explicitly don't have dashboardSelection, 
                // we clear it so the history effect below can provide the default fallback.
                setSelectedAssets(new Set());
            }

            if (settings.xirrMode) {
                setXirrMode(settings.xirrMode);
            }
            
            initializedSettingsForPortfolioRef.current = selectedPortfolioId;
        }
    }, [settings, selectedPortfolioId]);

    // Reset period stats when portfolio changes
    useEffect(() => {
        setPeriodStats(null);
    }, [selectedPortfolioId]);

    // Update selection when history loads (if no selection yet) (ONCE per portfolio)
    useEffect(() => {
        if (history?.series && !settings?.dashboardSelection && autoFilledPortfolioRef.current !== selectedPortfolioId) {
            const allIsins = new Set<string>(history.series.map((s: any) => s.isin));
            setSelectedAssets(allIsins);
            autoFilledPortfolioRef.current = selectedPortfolioId;
        }
    }, [history, settings, selectedPortfolioId]);

    // Handle explicit selection changes
    const handleSelectionChange = (newSelection: Set<string>) => {
        setSelectedAssets(newSelection);
        if (selectedPortfolioId) {
            updateSettingsMutation.mutate({
                portfolioId: selectedPortfolioId,
                settings: { dashboardSelection: Array.from(newSelection) }
            });
        }
    };

    // Handle T1/T2 Commit
    const handleCommitSettings = () => {
        const t1 = parseInt(inputT1) || 30;
        const t2 = parseInt(inputT2) || 365;

        if (t1 !== mwrT1 || t2 !== mwrT2) {
            setMwrT1(t1);
            setMwrT2(t2);
            updateSettingsMutation.mutate({
                portfolioId: selectedPortfolioId!,
                settings: { mwr_t1: t1, mwr_t2: t2 }
            });
        }
    };

    // --- Render Helpers ---

    const getPeriodDateString = () => {
        if (!periodStats) return "";
        const formatPortion = (isoDate: string) => {
            const parts = (isoDate || '').split('T')[0].split('-');
            return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : '';
        };
        const sDate = formatPortion(periodStats.startDate || '');
        const eDate = formatPortion(periodStats.date);
        return sDate ? `(${sDate} - ${eDate})` : `al ${eDate}`;
    };

    const isLoading = isLoadingSummary || isLoadingHistory || isLoadingSettings;

    if (isLoading) {
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

    // Determine which data to show
    const displaySummary = isFullSelection ? summary : (filteredSummary || summary); // Fallback to summary if loading filtered
    // For history, if full selection, use main history. If filtered, use filtered history.
    // BUT we need to be careful: if filtered history is loading, what do we show? 
    // Maybe show loading or fallback?
    // If we are fetching filtered history, `filteredHistory` might be undefined.

    // We can compute a synthetic portfolio locally while loading, or just wait.
    // The original code computed synthetic portfolio.
    // To match original behavior of "instant" responsiveness, we might want to keep the local filtering logic FOR THE CHART temporarily?
    // React Query is fast, but server trip takes time.
    // Let's use the `filteredHistory` if available, otherwise `history` but filtered locally?
    // Actually, `useDashboardHistory` with assets param returns the subset SERIES and a specific PORTFOLIO line (MWR adjusted).
    // Local filtering can't easily do MWR.
    // So we should wait for `filteredHistory`.

    const displayHistory = isFullSelection ? history : (filteredHistory || { series: [], portfolio: [] });

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
            <PanelHeader title={`Dashboard${portfolioDetails?.name ? ` - ${portfolioDetails.name}` : ''}`}>
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
                            {!isFullSelection && displaySummary && (
                                <div className="mt-2 pt-2 border-t border-white/10">
                                    <div className="flex items-center gap-2">
                                        <div className="text-sm font-semibold text-muted-foreground">
                                            €{formatSwissMoney(displaySummary.total_value)}
                                        </div>
                                        <p className="text-[10px] text-muted-foreground/70 uppercase">
                                            (Asset selezionati)
                                        </p>
                                    </div>
                                </div>
                            )}
                            {periodStats && !periodStats.isFullRange && (
                                <div className="mt-2 pt-2 border-t border-blue-500/30">
                                    <div className="flex items-center gap-2">
                                        <div className="text-sm font-semibold text-blue-400">
                                            €{formatSwissMoney(periodStats.market_value)}
                                        </div>
                                        <p className="text-[10px] text-blue-400/70 uppercase">
                                            (al {(() => {
                                                const parts = periodStats.date.split('T')[0].split('-');
                                                return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : periodStats.date;
                                            })()})
                                        </p>
                                    </div>
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
                            {!isFullSelection && displaySummary && (
                                <div className="mt-2 pt-2 border-t border-white/10">
                                    <div className="flex items-center gap-2">
                                        <div className={`text-sm font-semibold ${displaySummary.xirr >= 0 ? 'text-green-500/80' : 'text-red-500/80'}`}>
                                            {displaySummary.xirr}%
                                        </div>
                                        <p className="text-[10px] text-muted-foreground/70 uppercase">
                                            (Asset selezionati)
                                        </p>
                                    </div>
                                </div>
                            )}
                            {periodStats && !periodStats.isFullRange && (
                                <div className="mt-2 pt-2 border-t border-blue-500/30">
                                    <div className="flex items-center gap-2">
                                        <div className={`text-sm font-semibold ${periodStats.mwr >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            {formatSwissNumber(periodStats.mwr, 2)}%
                                        </div>
                                        <p className="text-[10px] text-blue-400/70 uppercase">
                                            {getPeriodDateString()}
                                        </p>
                                    </div>
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
                            {!isFullSelection && displaySummary && (
                                <div className="mt-2 pt-2 border-t border-white/10">
                                    <div className="flex items-center gap-2">
                                        <div className={`text-sm font-semibold ${displaySummary.pl_value >= 0 ? 'text-green-500/80' : 'text-red-500/80'}`}>
                                            €{formatSwissMoney(displaySummary.pl_value)}
                                        </div>
                                        <p className="text-[10px] text-muted-foreground/70 uppercase">
                                            (Asset selezionati)
                                        </p>
                                    </div>
                                </div>
                            )}
                            {periodStats && !periodStats.isFullRange && (
                                <div className="mt-2 pt-2 border-t border-blue-500/30">
                                    <div className="flex items-center gap-2">
                                        <div className={`text-sm font-semibold ${periodStats.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            €{formatSwissMoney(periodStats.pnl)}
                                        </div>
                                        <p className="text-[10px] text-blue-400/70 uppercase">
                                            {getPeriodDateString()}
                                        </p>
                                    </div>
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
                                        {history?.series && selectedAssets.size === history.series.length
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
                                            if (history?.series) {
                                                if (isFullSelection) {
                                                    handleSelectionChange(new Set());
                                                } else {
                                                    const allIsins = new Set<string>(history.series.map((s: any) => s.isin));
                                                    handleSelectionChange(allIsins);
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
                                        {Array.from(new Set((history?.series || []).map((s: any) => s.type || "Altro")))
                                            .sort((a: any, b: any) => b.localeCompare(a))
                                            .map((type: any) => {
                                                const assetsOfType = (history?.series || []).filter((s: any) => (s.type || "Altro") === type);
                                                const allSelected = assetsOfType.every((s: any) => selectedAssets.has(s.isin));
                                                const someSelected = assetsOfType.some((s: any) => selectedAssets.has(s.isin));
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
                                                                handleSelectionChange(next);
                                                            }}
                                                            className="border-white/50 data-[state=checked]:bg-primary"
                                                        />
                                                            <label
                                                            htmlFor={`type-${type}`}
                                                            className="text-xs font-medium cursor-pointer flex-1 truncate"
                                                            title={type}
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                const next = new Set<string>();
                                                                assetsOfType.forEach((s: any) => next.add(s.isin));
                                                                handleSelectionChange(next);
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
                                        {(() => {
                                            const activeIsins = new Set(summary?.allocation?.map((a: any) => a.isin) || []);
                                            const allSeries = (history?.series || []);

                                            const activeAssets = allSeries.filter((s: any) => activeIsins.has(s.isin));
                                            const historicalAssets = allSeries.filter((s: any) => !activeIsins.has(s.isin));

                                            const renderAssetRow = (s: any, idx: number) => {
                                                const rawColor = s.color || COLORS[idx % COLORS.length];
                                                const accessibleColor = getAccessibleColor(rawColor, 60);

                                                return (
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
                                                                handleSelectionChange(next);
                                                            }}
                                                            className="border-2 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground h-4 w-4"
                                                            style={{
                                                                borderColor: accessibleColor,
                                                                backgroundColor: selectedAssets.has(s.isin) ? accessibleColor : 'transparent'
                                                            }}
                                                        />
                                                        <label
                                                            htmlFor={`filter-${s.isin}`}
                                                            className={`text-xs font-medium leading-none cursor-pointer w-full text-left ${activeIsins.has(s.isin) ? '' : 'text-muted-foreground italic'}`}
                                                            title={`${s.name} (${s.isin}) ${!activeIsins.has(s.isin) ? '- Sold' : ''}`}
                                                            style={{ color: activeIsins.has(s.isin) ? accessibleColor : undefined }}
                                                        >
                                                            <div className="truncate w-full flex justify-between">
                                                                <span>{s.name}</span>
                                                                {!activeIsins.has(s.isin) && <span className="text-[9px] opacity-70 ml-1 px-1 bg-white/10 rounded">STORICO</span>}
                                                            </div>
                                                        </label>
                                                    </div>
                                                );
                                            };

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
                    <div className="flex-1 min-h-0">
                        <DashboardCharts
                            key={selectedPortfolioId}
                            allocationData={summary.allocation}
                            history={displayHistory || { series: [], portfolio: [] }}
                            initialSettings={settings as any}
                            onSettingsChange={(newSettings) => updateSettingsMutation.mutate({ portfolioId: selectedPortfolioId!, settings: newSettings })}
                            portfolioName="" // Was being fetched logic, now simplified. Charts might not need it for display if header has it.
                            className="h-full"
                            mwrMode={displayHistory?.mwr_mode}
                            xirrMode={xirrMode}
                            onVisibleStatsChange={setPeriodStats}
                            hidePortfolio={false}
                            onXirrModeChange={(mode) => {
                                setXirrMode(mode);
                                if (selectedPortfolioId) {
                                    updateSettingsMutation.mutate({
                                        portfolioId: selectedPortfolioId,
                                        settings: { xirrMode: mode }
                                    });
                                }
                            }}
                        />
                    </div>
                </div>
            </div>
        </div >
    );
}
