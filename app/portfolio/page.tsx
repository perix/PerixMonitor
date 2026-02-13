'use client';

import { PanelHeader } from "@/components/layout/PanelHeader";
import { Separator } from "@/components/ui/separator";
import { usePortfolio } from "@/context/PortfolioContext";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import axios from "axios";
import { AssetList } from "@/components/portfolio/AssetList";
import { AssetDetailPanel } from "@/components/portfolio/AssetDetailPanel";
import { ResizablePortfolioLayout } from "@/components/portfolio/ResizablePortfolioLayout";
import { formatSwissMoney } from "@/lib/utils";

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
    latest_price?: number;
    price_date?: string;
    price_source?: string;
    current_qty?: number;
    current_value?: number;
    invested?: number;
    pnl_value?: number;
    pnl_percent?: number;
    mwr?: number;
    last_trend_variation?: number;
    last_trend_days?: number;
}

export default function PortfolioPage() {
    const { selectedPortfolioId, portfolioCache, setPortfolioCache } = usePortfolio();
    const [assets, setAssets] = useState<Asset[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedIsin, setSelectedIsin] = useState<string | null>(null);
    const [portfolioName, setPortfolioName] = useState<string>("");
    const [liquidity, setLiquidity] = useState<number>(0);
    const [isEditingLiquidity, setIsEditingLiquidity] = useState(false);

    // [PERSISTENCE STATE]
    const [layoutWidth, setLayoutWidth] = useState(30);
    const [selectedType, setSelectedType] = useState<string>("ALL");
    const [selectedTrend, setSelectedTrend] = useState<string>("ALL");

    useEffect(() => {
        async function fetchAssets() {
            if (!selectedPortfolioId) {
                setLoading(false);
                return;
            }

            // Check Cache
            if (portfolioCache[selectedPortfolioId]) {
                const cached = portfolioCache[selectedPortfolioId];
                setAssets(cached.assets);
                setPortfolioName(cached.name);

                // Use cached settings if available
                if (cached.settings) {
                    setLiquidity(Number(cached.settings.liquidity) || 0);
                    if (cached.settings.layoutWidth) setLayoutWidth(cached.settings.layoutWidth);
                    if (cached.settings.selectedType) setSelectedType(cached.settings.selectedType);
                    if (cached.settings.selectedTrend) setSelectedTrend(cached.settings.selectedTrend);

                    // Saved ISIN from DB
                    if (cached.settings.selectedIsin && cached.assets.some(a => a.isin === cached.settings.selectedIsin)) {
                        setSelectedIsin(cached.settings.selectedIsin);
                    } else if (!selectedIsin && cached.assets.length > 0) {
                        setSelectedIsin(cached.assets[0].isin);
                    }
                } else {
                    // Fallback fetch settings
                    try {
                        const portfolioRes = await axios.get(`/api/portfolio/${selectedPortfolioId}`);
                        const settings = portfolioRes.data.settings || {};
                        setLiquidity(Number(settings.liquidity) || 0);
                        if (settings.layoutWidth) setLayoutWidth(settings.layoutWidth);
                        if (settings.selectedType) setSelectedType(settings.selectedType || "ALL");
                        if (settings.selectedTrend) setSelectedTrend(settings.selectedTrend || "ALL");

                        if (settings.selectedIsin && cached.assets.some(a => a.isin === settings.selectedIsin)) {
                            setSelectedIsin(settings.selectedIsin);
                        } else if (!selectedIsin && cached.assets.length > 0) {
                            setSelectedIsin(cached.assets[0].isin);
                        }
                    } catch (e) { console.error(e) }
                }

                setLoading(false);
                return;
            }

            setLoading(true);
            try {
                // Parallel fetch for assets and portfolio details
                const [assetsRes, portfolioRes] = await Promise.all([
                    axios.get(`/api/portfolio/assets?portfolio_id=${selectedPortfolioId}`),
                    axios.get(`/api/portfolio/${selectedPortfolioId}`)
                ]);

                const fetchedAssets = assetsRes.data.assets || [];
                const fetchedName = portfolioRes.data.name || "";
                const fetchedSettings = portfolioRes.data.settings || {};

                setAssets(fetchedAssets);
                setPortfolioName(fetchedName);
                setLiquidity(Number(fetchedSettings.liquidity) || 0);
                if (fetchedSettings.layoutWidth) setLayoutWidth(fetchedSettings.layoutWidth);
                setSelectedType(fetchedSettings.selectedType || "ALL");
                setSelectedTrend(fetchedSettings.selectedTrend || "ALL");

                // Selection Logic (DB > First)
                if (fetchedSettings.selectedIsin && fetchedAssets.some((a: any) => a.isin === fetchedSettings.selectedIsin)) {
                    setSelectedIsin(fetchedSettings.selectedIsin);
                } else if (!selectedIsin && fetchedAssets.length > 0) {
                    setSelectedIsin(fetchedAssets[0].isin);
                }

                // Update Cache
                setPortfolioCache(selectedPortfolioId, {
                    assets: fetchedAssets,
                    name: fetchedName,
                    settings: fetchedSettings // Cache settings too
                });

            } catch (e) {
                console.error("Portfolio data fetch error:", e);
            } finally {
                setLoading(false);
            }
        }

        fetchAssets();
    }, [selectedPortfolioId]);

    // [PERSISTENCE] Save selection and layout on change
    // Using simple debounce helper or effect
    useEffect(() => {
        if (selectedPortfolioId && selectedIsin) {
            // Check if different from cached? Or just save.
            // We use a small timeout to bundle layout changes?
            const timer = setTimeout(() => {
                axios.patch(`/api/portfolio/${selectedPortfolioId}/settings`, {
                    selectedIsin: selectedIsin
                }).catch(console.error);
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [selectedIsin, selectedPortfolioId]);

    const handleLayoutChange = (width: number) => {
        setLayoutWidth(width);

        if (selectedPortfolioId) {
            // Update Cache
            if (portfolioCache[selectedPortfolioId]) {
                const currentCache = portfolioCache[selectedPortfolioId];
                setPortfolioCache(selectedPortfolioId, {
                    ...currentCache,
                    settings: {
                        ...currentCache.settings,
                        layoutWidth: width
                    }
                });
            }

            axios.patch(`/api/portfolio/${selectedPortfolioId}/settings`, {
                layoutWidth: width
            }).catch(console.error);
        }
    };

    const handleTypeChange = (type: string) => {
        setSelectedType(type);

        if (selectedPortfolioId) {
            // Update Cache
            if (portfolioCache[selectedPortfolioId]) {
                const currentCache = portfolioCache[selectedPortfolioId];
                setPortfolioCache(selectedPortfolioId, {
                    ...currentCache,
                    settings: {
                        ...currentCache.settings,
                        selectedType: type
                    }
                });
            }

            axios.patch(`/api/portfolio/${selectedPortfolioId}/settings`, {
                selectedType: type
            }).catch(console.error);
        }
    };

    const handleLiquidityUpdate = async (newValue: string) => {
        if (!selectedPortfolioId) return;
        const val = parseFloat(newValue);
        if (isNaN(val)) return;

        setLiquidity(val);

        // Optimistic Cache Update
        if (portfolioCache[selectedPortfolioId]) {
            const currentCache = portfolioCache[selectedPortfolioId];
            setPortfolioCache(selectedPortfolioId, {
                ...currentCache,
                settings: {
                    ...currentCache.settings,
                    liquidity: val
                }
            });
        }

        try {
            await axios.patch(`/api/portfolio/${selectedPortfolioId}/settings`, {
                liquidity: val
            });
        } catch (e) {
            console.error("Failed to update liquidity", e);
            // Optionally revert state on error (omitted for simplicity as it's a minor UX risk)
        }
    };

    const handleTrendChange = (trend: string) => {
        setSelectedTrend(trend);

        if (selectedPortfolioId) {
            // Update Cache
            if (portfolioCache[selectedPortfolioId]) {
                const currentCache = portfolioCache[selectedPortfolioId];
                setPortfolioCache(selectedPortfolioId, {
                    ...currentCache,
                    settings: {
                        ...currentCache.settings,
                        selectedTrend: trend
                    }
                });
            }

            axios.patch(`/api/portfolio/${selectedPortfolioId}/settings`, {
                selectedTrend: trend
            }).catch(console.error);
        }
    };

    const selectedAsset = assets.find(a => a.isin === selectedIsin) || null;

    // Calculate totals
    const totalAssetsValue = assets.reduce((sum, asset) => sum + (asset.current_value || 0), 0);
    const totalPortfolioValue = totalAssetsValue + liquidity;
    const liquidityPercent = totalPortfolioValue > 0 ? (liquidity / totalPortfolioValue) * 100 : 0;

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center p-8">
                <Loader2 className="animate-spin h-8 w-8 text-primary" />
            </div>
        );
    }

    if (!selectedPortfolioId) {
        return (
            <div className="flex flex-1 flex-col h-full bg-background/50 p-6">
                <PanelHeader title="Portafoglio" />
                <div className="text-center p-8">
                    <h2 className="text-xl font-semibold">Nessun portafoglio selezionato</h2>
                    <p className="text-muted-foreground">Seleziona un portafoglio dalla home per visualizzare gli asset.</p>
                </div>
            </div>
        );
    }

    if (assets.length === 0 && liquidity === 0) {
        return (
            <div className="flex flex-1 flex-col h-full bg-background/50 p-6">
                <PanelHeader title="Portafoglio" />
                <div className="text-center p-8">
                    <h2 className="text-xl font-semibold">Nessun asset presente</h2>
                    <p className="text-muted-foreground">Carica dei dati per visualizzare gli asset in portafoglio.</p>
                </div>
            </div>
        );
    }


    return (
        <div className="flex flex-col h-full bg-background/50 p-6 overflow-hidden">
            <div className="flex flex-col gap-2 mb-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <h1 className="text-2xl font-bold tracking-tight">
                            {portfolioName ? `Portafoglio - ${portfolioName}` : "Portafoglio"}
                        </h1>
                        <div className="flex items-center gap-2 text-lg">
                            <span className="font-medium text-muted-foreground">Liquidità:</span>
                            <input
                                type="number"
                                value={liquidity}
                                onChange={(e) => setLiquidity(parseFloat(e.target.value) || 0)}
                                onBlur={() => handleLiquidityUpdate(liquidity.toString())}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.currentTarget.blur();
                                    }
                                }}
                                className="w-32 bg-transparent border-b border-dashed border-muted-foreground/50 focus:border-primary focus:outline-none text-right font-mono"
                                placeholder="0.00"
                                step="100"
                            />
                            <span className="font-medium">€</span>
                            <span className="text-muted-foreground ml-2">
                                (Totale {formatSwissMoney(totalPortfolioValue)} € - liquidità {liquidityPercent.toFixed(0)}%)
                            </span>
                        </div>
                    </div>
                </div>
                <Separator className="bg-border/40" />
            </div>

            <div className="flex-1 w-full min-h-0 relative">
                <ResizablePortfolioLayout
                    widthPercent={layoutWidth}
                    onWidthChange={handleLayoutChange}
                    leftPanel={
                        <AssetList
                            assets={assets}
                            selectedIsin={selectedIsin}
                            onSelect={setSelectedIsin}
                            selectedType={selectedType}
                            onTypeChange={handleTypeChange}
                            selectedTrend={selectedTrend}
                            onTrendChange={handleTrendChange}
                        />
                    }
                    rightPanel={
                        <AssetDetailPanel asset={selectedAsset} />
                    }
                />
            </div>
        </div>
    );
}
