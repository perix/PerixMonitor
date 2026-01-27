'use client';

import { PanelHeader } from "@/components/layout/PanelHeader";
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

                setAssets(fetchedAssets);
                setPortfolioName(fetchedName);

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

    const selectedAsset = assets.find(a => a.isin === selectedIsin) || null;

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

    if (assets.length === 0) {
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
            <PanelHeader title={portfolioName ? `Portafoglio ${portfolioName}` : "Portafoglio"} />

            <div className="flex-1 w-full min-h-0 mt-4 relative">
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
