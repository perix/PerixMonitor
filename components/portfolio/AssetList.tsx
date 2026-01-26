'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface Asset {
    id: string;
    isin: string;
    name: string;
    ticker?: string;
    metadata?: any;
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
    return (
        <Card className="h-full flex flex-col bg-card/80 backdrop-blur-xl border-white/40 shadow-sm relative">
            <CardHeader className="px-4 py-3 border-b border-white/40 shrink-0">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    Asset ({assets.length})
                </CardTitle>
            </CardHeader>

            <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/40 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/60">
                <CardContent className="p-2 flex flex-col gap-1">
                    {assets.map((asset) => {
                        const displayName = getAssetDisplayName(asset);
                        const isSelected = selectedIsin === asset.isin;

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
                                        isSelected ? "text-primary" : "text-foreground"
                                    )}>
                                        {displayName}
                                    </span>
                                    <span className="text-[11px] text-muted-foreground font-mono truncate opacity-70">
                                        {asset.isin}
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                </CardContent>
            </div>
        </Card>
    );
}
