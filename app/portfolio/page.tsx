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
}

export default function PortfolioPage() {
    const { selectedPortfolioId, portfolioCache, setPortfolioCache } = usePortfolio();
    const [assets, setAssets] = useState<Asset[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedIsin, setSelectedIsin] = useState<string | null>(null);
    const [portfolioName, setPortfolioName] = useState<string>("");
    const [liquidity, setLiquidity] = useState<number>(0);
    const [isEditingLiquidity, setIsEditingLiquidity] = useState(false);

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
                // We don't cache liquidity specifically in the portfolioCache type yet, 
                // but we can fetch it or just rely on the fresh fetch below if we want to be safe.
                // For now, let's always fetch settings to get the fresh liquidity.
                // Ideally, we should update the cache structure to include settings/liquidity.

                // Let's do a quick fetch for settings anyway to ensure liquidity is up to date
                try {
                    const portfolioRes = await axios.get(`/api/portfolio/${selectedPortfolioId}`);
                    const settings = portfolioRes.data.settings || {};
                    setLiquidity(Number(settings.liquidity) || 0);
                } catch (e) {
                    console.error("Failed to fetch latest liquidity", e);
                }

                // Auto-select first asset if available and none selected yet
                if (cached.assets.length > 0 && !selectedIsin) {
                    setSelectedIsin(cached.assets[0].isin);
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

                // Auto-select first asset if available
                if (fetchedAssets.length > 0 && !selectedIsin) {
                    setSelectedIsin(fetchedAssets[0].isin);
                }

                // Update Cache
                setPortfolioCache(selectedPortfolioId, {
                    assets: fetchedAssets,
                    name: fetchedName
                });

            } catch (e) {
                console.error("Portfolio data fetch error:", e);
            } finally {
                setLoading(false);
            }
        }

        fetchAssets();
    }, [selectedPortfolioId]);

    const handleLiquidityUpdate = async (newValue: string) => {
        if (!selectedPortfolioId) return;
        const val = parseFloat(newValue);
        if (isNaN(val)) return;

        setLiquidity(val);
        try {
            await axios.patch(`/api/portfolio/${selectedPortfolioId}/settings`, {
                liquidity: val
            });
        } catch (e) {
            console.error("Failed to update liquidity", e);
            // Optionally revert state on error
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
                            {portfolioName ? `Portafoglio ${portfolioName}` : "Portafoglio"}
                        </h1>
                        <div className="flex items-center gap-2 text-lg">
                            <input
                                type="number"
                                value={liquidity}
                                onChange={(e) => handleLiquidityUpdate(e.target.value)}
                                className="w-32 bg-transparent border-b border-dashed border-muted-foreground/50 focus:border-primary focus:outline-none text-right font-mono"
                                placeholder="0.00"
                                step="100"
                            />
                            <span className="font-medium">€</span>
                            <span className="text-muted-foreground ml-2">
                                (Totale {totalPortfolioValue.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € - liquidità {liquidityPercent.toFixed(0)}%)
                            </span>
                        </div>
                    </div>
                </div>
                <Separator className="bg-border/40" />
            </div>

            <div className="flex-1 w-full min-h-0 relative">
                <ResizablePortfolioLayout
                    leftPanel={
                        <AssetList
                            assets={assets}
                            selectedIsin={selectedIsin}
                            onSelect={setSelectedIsin}
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
