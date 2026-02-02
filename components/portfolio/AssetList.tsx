'use client';

import { useState, useMemo, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface Asset {
    id: string;
    isin: string;
    name: string;
    ticker?: string;
    asset_class?: string;
    metadata?: any;
    last_trend_variation?: number;
}

interface AssetListProps {
    assets: Asset[];
    selectedIsin: string | null;
    onSelect: (isin: string) => void;
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
    // Fallback: just ISIN
    return asset.isin;
}

export function AssetList({ assets, selectedIsin, onSelect }: AssetListProps) {
    const [selectedType, setSelectedType] = useState<string>("ALL");
    const [threshold, setThreshold] = useState(0.1);

    useEffect(() => {
        axios.get('/api/config/assets').then(res => {
            if (res.data?.priceVariationThreshold !== undefined) setThreshold(res.data.priceVariationThreshold);
        }).catch(err => console.error("Failed to load asset config", err));
    }, []);

    // Extract unique asset types
    const uniqueTypes = useMemo(() => {
        const types = new Set<string>();
        assets.forEach(asset => {
            const type = asset.asset_class || "Altro";
            types.add(type);
        });
        return Array.from(types).sort();
    }, [assets]);

    // Filter assets
    const filteredAssets = useMemo(() => {
        if (selectedType === "ALL") return assets;
        return assets.filter(asset => {
            const type = asset.asset_class || "Altro";
            return type === selectedType;
        });
    }, [assets, selectedType]);

    return (
        <Card className="h-full flex flex-col bg-card/80 backdrop-blur-xl border-white/40 shadow-sm relative">
            <CardHeader className="px-4 py-3 border-b border-white/40 shrink-0 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xl font-bold text-muted-foreground uppercase tracking-wider">
                    Asset ({filteredAssets.length})
                </CardTitle>
                <div className="w-[140px]">
                    <Select value={selectedType} onValueChange={setSelectedType}>
                        <SelectTrigger className="h-8 bg-white/5 border-white/20 text-xs">
                            <SelectValue placeholder="Tipo" />
                        </SelectTrigger>
                        <SelectContent align="end">
                            <SelectItem value="ALL">Tutti</SelectItem>
                            {uniqueTypes.map((type) => (
                                <SelectItem key={type} value={type}>
                                    {type}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </CardHeader>

            <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/40 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/60">
                <CardContent className="p-2 flex flex-col gap-1">
                    {filteredAssets.map((asset) => {
                        const displayName = getAssetDisplayName(asset);
                        const isSelected = selectedIsin === asset.isin;

                        const variation = asset.last_trend_variation || 0;
                        const isSignificant = Math.abs(variation) >= threshold;
                        const trendColor = isSignificant
                            ? (variation > 0 ? "text-green-500" : "text-red-500")
                            : "";

                        return (
                            <button
                                key={asset.isin}
                                onClick={() => onSelect(asset.isin)}
                                className={cn(
                                    "w-full text-left px-3 py-1.5 rounded-lg transition-all duration-200 border-2",
                                    "hover:bg-white/5 focus:outline-none",
                                    isSelected
                                        ? "bg-primary/10 border-primary shadow-[0_0_15px_rgba(var(--primary),0.2)]"
                                        : "border-transparent hover:border-white/20"
                                )}
                            >
                                <div className="flex flex-col w-full gap-0.5">
                                    <span className={cn(
                                        "font-medium text-sm truncate",
                                        isSelected
                                            ? "text-primary"
                                            : (isSignificant ? trendColor : "text-foreground")
                                    )}>
                                        {displayName}
                                    </span>
                                    <div className="flex justify-between items-center text-[11px] text-muted-foreground font-mono opacity-70">
                                        <span className="truncate">{asset.isin}</span>
                                        {asset.asset_class && (
                                            <span className="ml-2 bg-white/10 px-1 rounded text-[9px] uppercase tracking-wide">
                                                {asset.asset_class}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </CardContent>
            </div>
        </Card>
    );
}
