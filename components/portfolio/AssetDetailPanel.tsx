'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { TrendingUp, TrendingDown, Euro, Database, Activity, ArrowUpRight, ArrowDownRight, Loader2 } from "lucide-react";
import { formatSwissMoney, formatSwissNumber } from "@/lib/utils";
import { DashboardCharts } from "@/components/dashboard/DashboardCharts";
import { usePortfolio } from "@/context/PortfolioContext";
import axios from "axios";
import { useEffect, useState, useCallback, useRef } from "react";

interface Asset {
    id: string;
    isin: string;
    name: string;
    ticker?: string;
    asset_class?: string;
    country?: string;
    sector?: string;
    rating?: string;
    issuer?: string;
    currency?: string;
    metadata?: any;
    metadata_text?: string;
    latest_price?: number;
    price_date?: string;
    price_source?: string;
    current_qty?: number;
    current_value?: number;
    invested?: number;
    pnl_value?: number;
    pnl_percent?: number;

    mwr?: number;
    mwr_type?: string;
    last_trend_variation?: number;
    last_trend_days?: number;
}

interface AssetDetailPanelProps {
    asset: Asset | null;
}

function getAssetDisplayName(asset: Asset): string {
    // Priority 1: DB name column (from Excel "Descrizione Titolo")
    if (asset.name && asset.name !== asset.isin) {
        return asset.name;
    }
    // Priority 2: LLM metadata profile.name (fallback)
    if (asset.metadata?.profile?.name) {
        return asset.metadata.profile.name;
    }
    return asset.isin;
}

// Render a single metadata field
function MetadataField({ label, value }: { label: string; value: any }) {
    if (value === null || value === undefined || value === '') return null;

    // Handle arrays
    if (Array.isArray(value)) {
        if (value.length === 0) return null;
        // Check if it's an array of objects (like underlyings)
        if (typeof value[0] === 'object') {
            return (
                <div className="py-2 border-b border-white/5">
                    <span className="text-xs text-muted-foreground block mb-2">{label}</span>
                    <div className="space-y-1">
                        {value.map((item, idx) => (
                            <div key={idx} className="text-sm text-foreground bg-black/20 rounded px-2 py-1">
                                {Object.entries(item)
                                    .filter(([_, v]) => v !== null && v !== undefined)
                                    .map(([k, v]) => `${k}: ${v}`)
                                    .join(' | ')}
                            </div>
                        ))}
                    </div>
                </div>
            );
        }
        return (
            <div className="py-2 border-b border-white/5">
                <span className="text-xs text-muted-foreground block">{label}</span>
                <span className="text-sm text-foreground">{value.join(', ')}</span>
            </div>
        );
    }

    // Handle nested objects
    if (typeof value === 'object') {
        const entries = Object.entries(value).filter(([_, v]) => v !== null && v !== undefined);
        if (entries.length === 0) return null;

        return (
            <div className="py-2 border-b border-white/5">
                <span className="text-xs text-muted-foreground block mb-1">{label}</span>
                <div className="pl-3 space-y-1">
                    {entries.map(([key, val]) => (
                        <div key={key} className="text-sm">
                            <span className="text-muted-foreground">{key}: </span>
                            <span className="text-foreground">
                                {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // Handle simple values
    return (
        <div className="py-2 border-b border-white/5">
            <span className="text-xs text-muted-foreground block">{label}</span>
            <span className="text-sm text-foreground">{String(value)}</span>
        </div>
    );
}

// Render a section of metadata
function MetadataSection({ title, data }: { title: string; data: any }) {
    if (!data || typeof data !== 'object') return null;

    const entries = Object.entries(data).filter(([_, v]) => {
        if (v === null || v === undefined) return false;
        if (typeof v === 'object' && !Array.isArray(v)) {
            return Object.values(v).some(val => val !== null && val !== undefined);
        }
        return true;
    });

    if (entries.length === 0) return null;

    return (
        <div className="mb-4">
            <h4 className="text-sm font-semibold text-primary mb-2 uppercase tracking-wider">{title}</h4>
            <div className="bg-black/20 rounded-lg p-3 border border-white/5">
                {entries.map(([key, value]) => (
                    <MetadataField key={key} label={key} value={value} />
                ))}
            </div>
        </div>
    );
}

// Full metadata display component
function FullMetadataDisplay({ metadata, metadataText }: { metadata: any; metadataText?: string }) {
    // Priority 1: If metadata_text exists, render as markdown
    if (metadataText) {
        // Dynamic import to avoid SSR issues
        const ReactMarkdown = require('react-markdown').default;
        return (
            <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown>{metadataText}</ReactMarkdown>
            </div>
        );
    }

    // Priority 2: Structured JSON metadata
    if (!metadata) {
        return (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
                <Database className="h-5 w-5 mr-2" />
                Nessun metadata AI disponibile per questo asset
            </div>
        );
    }

    // Display each top-level section of the metadata
    const sections = [
        { key: 'identifiers', title: 'Identificativi' },
        { key: 'profile', title: 'Profilo' },
        { key: 'classification', title: 'Classificazione' },
        { key: 'risk', title: 'Rischio' },
        { key: 'costs', title: 'Costi' },
        { key: 'cashflows', title: 'Flussi di Cassa' },
        { key: 'productFeatures', title: 'Caratteristiche Prodotto' },
        { key: 'ratings', title: 'Rating' },
        { key: 'quality', title: 'Qualità Dati' },
    ];

    return (
        <div className="space-y-2">
            {/* Asset Type Badge */}
            {metadata.assetType && (
                <div className="mb-4">
                    <Badge variant="secondary" className="bg-primary/20 text-primary border-primary/30 text-sm">
                        {metadata.assetType}
                    </Badge>
                </div>
            )}

            {sections.map(({ key, title }) => (
                <MetadataSection key={key} title={title} data={metadata[key]} />
            ))}
        </div>
    );
}

export function AssetDetailPanel({ asset }: AssetDetailPanelProps) {
    if (!asset) {
        return (
            <div className="h-full flex flex-col gap-4">
                <Card className="flex-1 bg-card/80 backdrop-blur-xl border-white/20 flex items-center justify-center">
                    <p className="text-muted-foreground">Seleziona un asset dalla lista</p>
                </Card>
            </div>
        );
    }

    const { selectedPortfolioId, assetHistoryCache, setAssetHistoryCache, assetSettingsCache, setAssetSettingsCache } = usePortfolio();
    const [history, setHistory] = useState<any>(null);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [visibleStats, setVisibleStats] = useState<{ pnl: number; mwr: number } | null>(null);
    const [threshold, setThreshold] = useState(0.1);
    const [chartSettings, setChartSettings] = useState<any>(null);
    const lastAssetIdRef = useRef<string | null>(null);

    // Synchronous reset on asset change to avoid race conditions/leakage
    if (asset?.id !== lastAssetIdRef.current) {
        lastAssetIdRef.current = asset?.id || null;
        if (history !== null) setHistory(null);
        if (chartSettings !== null) setChartSettings(null);
        if (visibleStats !== null) setVisibleStats(null);
    }

    // Fetch threshold settings
    useEffect(() => {
        if (!selectedPortfolioId) return;
        axios.get('/api/config/assets', {
            params: { portfolio_id: selectedPortfolioId }
        }).then(res => {
            if (res.data?.priceVariationThreshold !== undefined) setThreshold(res.data.priceVariationThreshold);
        }).catch(err => console.error("Failed to load asset config", err));
    }, [selectedPortfolioId]);

    // Fetch history and settings when asset changes
    useEffect(() => {
        if (!asset || !selectedPortfolioId) {
            setHistory(null);
            setVisibleStats(null);
            setChartSettings(null);
            return;
        }

        const isin = asset.isin;
        const portfolioId = selectedPortfolioId;

        // 1. Handle History Cache
        if (assetHistoryCache && assetHistoryCache[portfolioId] && assetHistoryCache[portfolioId][isin]) {
            setHistory(assetHistoryCache[portfolioId][isin]);
        } else {
            const fetchHistory = async () => {
                setLoadingHistory(true);
                try {
                    const res = await axios.get(`/api/dashboard/history?portfolio_id=${portfolioId}&assets=${isin}`);
                    setHistory(res.data);
                    setAssetHistoryCache(portfolioId, isin, res.data);
                } catch (e) {
                    console.error("Failed to fetch asset history", e);
                } finally {
                    setLoadingHistory(false);
                }
            };
            fetchHistory();
        }

        // 2. Handle Asset Settings (Sliders) Cache
        const assetId = asset.id;
        if (assetSettingsCache && assetSettingsCache[portfolioId] && assetSettingsCache[portfolioId][assetId]) {
            setChartSettings(assetSettingsCache[portfolioId][assetId]);
        } else {
            // Fetch Settings
            axios.get(`/api/config/asset-settings`, {
                params: { portfolio_id: portfolioId, asset_id: assetId }
            }).then(res => {
                setChartSettings(res.data || {});
                setAssetSettingsCache(portfolioId, assetId, res.data || {});
            }).catch(err => console.error("Failed to load asset settings", err));
        }

        setVisibleStats(null);
    }, [asset?.isin, asset?.id, selectedPortfolioId]);

    const handleVisibleStatsChange = useCallback((stats: { pnl: number; mwr: number }) => {
        // Prevent unnecessary state updates if values are same (though object identity differs)
        setVisibleStats(prev => {
            if (prev && prev.pnl === stats.pnl && prev.mwr === stats.mwr) return prev;
            return stats;
        });
    }, []);

    const handleChartSettingsChange = useCallback((newSettings: any) => {
        if (!asset || !selectedPortfolioId) return;

        const assetId = asset.id;
        const portfolioId = selectedPortfolioId;

        // Update local state and cache
        setChartSettings(newSettings);
        setAssetSettingsCache(portfolioId, assetId, newSettings);

        // Persist to backend (debounced implicitly by DashboardCharts calling this?)
        // DashboardCharts already has a 1s debounce on onSettingsChange
        axios.post('/api/config/asset-settings', {
            portfolio_id: portfolioId,
            asset_id: assetId,
            settings: newSettings
        }).catch(err => console.error("Failed to persist asset settings", err));
    }, [asset?.id, selectedPortfolioId]);

    const displayName = getAssetDisplayName(asset);

    // Use visible stats if available (from chart interaction), otherwise fallback to asset snapshot
    const activePnl = visibleStats?.pnl ?? asset.pnl_value;
    const activeMwr = visibleStats?.mwr ?? asset.mwr;

    const isPnlPositive = (activePnl ?? 0) >= 0;
    const isMwrPositive = (activeMwr ?? 0) >= 0;

    return (
        <div className="h-full flex flex-col gap-4">
            {/* Top Panel: Main Asset Info */}
            <Card className="bg-card/80 backdrop-blur-xl border-white/40 shrink-0 min-w-0">
                <CardHeader className="pb-2">
                    <CardTitle className="text-xl font-bold text-muted-foreground uppercase tracking-wider">
                        INFORMAZIONI ASSET
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                        <div className="min-w-0 flex-1 basis-64">
                            <h2 className="text-2xl font-bold truncate">
                                {displayName}
                                {asset.metadata?.assetType && (
                                    <span className="text-lg font-normal text-muted-foreground ml-2">
                                        ({asset.metadata.assetType})
                                    </span>
                                )}
                            </h2>
                            <p className="text-sm text-muted-foreground font-mono">{asset.isin}</p>
                        </div>
                        <div className="text-right shrink-0">
                            {asset.latest_price && (
                                <>
                                    <p className="text-2xl font-bold text-primary">
                                        €{formatSwissMoney(asset.latest_price)}
                                    </p>
                                    {asset.price_date && (
                                        <p className="text-xs text-muted-foreground">
                                            al {asset.price_date}
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-8">
                        <div className="space-y-1">
                            <span className="text-xs text-muted-foreground block truncate">Quantità</span>
                            <div className="flex items-center gap-1">
                                <TrendingUp className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="font-medium text-base truncate">
                                    {formatSwissNumber(asset.current_qty, 4)}
                                </span>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <span className="text-xs text-muted-foreground block truncate">Controvalore</span>
                            <div className="flex items-center gap-1">
                                <Euro className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="font-medium text-base truncate">
                                    {asset.current_value ? `€${formatSwissMoney(asset.current_value)}` : '-'}
                                </span>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <span className="text-xs text-muted-foreground block truncate">Profitto/Perdita</span>
                            <div className="flex items-center gap-1">
                                {isPnlPositive ? <ArrowUpRight className="h-4 w-4 text-green-500 shrink-0" /> : <ArrowDownRight className="h-4 w-4 text-red-500 shrink-0" />}
                                <span className={`font-medium text-base truncate ${isPnlPositive ? 'text-green-500' : 'text-red-500'}`}>
                                    {activePnl !== undefined && activePnl !== null ? `€${formatSwissMoney(activePnl)}` : '-'}
                                </span>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <span className="text-xs text-muted-foreground block truncate">
                                {asset.mwr_type === 'SIMPLE' ? 'Simple Return' :
                                    asset.mwr_type === 'PERIOD' ? 'Period XIRR' :
                                        'MWR (Annual)'}
                            </span>
                            <div className="flex items-center gap-1">
                                <Activity className={`h-4 w-4 shrink-0 ${isMwrPositive ? 'text-green-500' : 'text-red-500'}`} />
                                <span className={`font-medium text-base truncate ${isMwrPositive ? 'text-green-500' : 'text-red-500'}`}>
                                    {activeMwr !== undefined && activeMwr !== null ? `${formatSwissNumber(activeMwr, 2)}%` : '-'}
                                </span>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <span className="text-xs text-muted-foreground block truncate">Ultima Variazione</span>
                            <div className="flex items-center gap-1">
                                {(() => {
                                    if (asset.last_trend_variation === undefined || asset.last_trend_variation === null) {
                                        return <span className="text-muted-foreground">-</span>;
                                    }
                                    const variation = asset.last_trend_variation;
                                    const isPositive = variation >= 0;

                                    const isSignificant = Math.abs(variation) >= threshold;
                                    const colorClass = isSignificant
                                        ? (variation > 0 ? "text-green-500" : "text-red-500")
                                        : "text-muted-foreground";
                                    const Icon = isPositive ? ArrowUpRight : ArrowDownRight;

                                    return (
                                        <>
                                            <Icon className={`h-4 w-4 shrink-0 ${colorClass}`} />
                                            <span className={`font-medium text-base truncate ${colorClass}`}>
                                                {variation > 0 ? '+' : ''}{formatSwissNumber(variation, 2)}%
                                                {asset.last_trend_days !== undefined && asset.last_trend_days !== null && (
                                                    <span className="ml-1 text-xs text-muted-foreground font-normal">
                                                        ({asset.last_trend_days} {asset.last_trend_days === 1 ? 'giorno' : 'giorni'})
                                                    </span>
                                                )}
                                            </span>
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Bottom Section: Chart + Details Grid */}
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-4">

                {/* Left: Chart (2 cols) */}
                <div className="lg:col-span-2 flex flex-col min-h-0">
                    {loadingHistory ? (
                        <Card className="bg-card/80 backdrop-blur-xl border-white/40 h-full flex items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </Card>
                    ) : history ? (
                        <DashboardCharts
                            key={asset.id}
                            allocationData={[]}
                            history={history}
                            portfolioName={displayName}
                            hidePortfolio={true}
                            className="mt-0 h-full"
                            onVisibleStatsChange={handleVisibleStatsChange}
                            initialSettings={chartSettings}
                            onSettingsChange={handleChartSettingsChange}
                        />
                    ) : (
                        <Card className="bg-card/80 backdrop-blur-xl border-white/40 h-full flex items-center justify-center">
                            <p className="text-muted-foreground">Grafico non disponibile</p>
                        </Card>
                    )}
                </div>

                {/* Right: Details (1 col) */}
                <Card className="bg-card/80 backdrop-blur-xl border-white/40 overflow-hidden flex flex-col min-h-0 lg:col-span-1">
                    <CardHeader className="pb-2 border-b border-white/10 shrink-0">
                        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                            <Database className="h-4 w-4" />
                            Info Asset (Dettagli)
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 overflow-y-auto flex-1">
                        <FullMetadataDisplay metadata={asset.metadata} metadataText={asset.metadata_text} />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
