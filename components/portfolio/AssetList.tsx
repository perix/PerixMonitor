'use client';

import { useState, useMemo, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, formatSwissNumber, formatSwissMoney } from "@/lib/utils";
import { ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { usePortfolio } from "@/context/PortfolioContext";

interface Asset {
    id: string;
    isin: string;
    name: string;
    ticker?: string;
    asset_class?: string;
    metadata?: any;
    last_trend_variation?: number;
    mwr?: number | null;
    mwr_type?: string;
}

type SortKey = 'name' | 'mwr' | 'type';
type SortDir = 'asc' | 'desc';

interface AssetListProps {
    assets: Asset[];
    selectedIsin: string | null;
    onSelect: (isin: string) => void;
    // Persistence
    selectedType: string;
    onTypeChange: (type: string) => void;
    selectedTrend: string;
    onTrendChange: (trend: string) => void;
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

export function AssetList({ assets, selectedIsin, onSelect, selectedType, onTypeChange, selectedTrend, onTrendChange }: AssetListProps) {
    const { selectedPortfolioId } = usePortfolio(); // Use context
    const [threshold, setThreshold] = useState(0.1);

    // Ordinamento locale (non persistito): per nome, MWR% o tipologia
    const [sortKey, setSortKey] = useState<SortKey>('name');
    const [sortDir, setSortDir] = useState<SortDir>('asc');

    const toggleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir(key === 'mwr' ? 'desc' : 'asc'); // MWR di default dal più alto
        }
    };

    useEffect(() => {
        if (!selectedPortfolioId) return;

        axios.get('/api/config/assets', {
            params: { portfolio_id: selectedPortfolioId }
        }).then(res => {
            if (res.data?.priceVariationThreshold !== undefined) setThreshold(res.data.priceVariationThreshold);
        }).catch(err => console.error("Failed to load asset config", err));
    }, [selectedPortfolioId]);

    // Extract unique asset types
    const uniqueTypes = useMemo(() => {
        const types = new Set<string>();
        assets.forEach(asset => {
            const type = asset.asset_class || "Altro";
            types.add(type);
        });
        return Array.from(types).sort();
    }, [assets]);

    // Multi-selezione tipi: `selectedType` è serializzato come "ALL" (tutti) oppure
    // come elenco di tipi separati da "|". Set vuoto = nessun filtro (tutti).
    const selectedTypeSet = useMemo(() => {
        if (!selectedType || selectedType === "ALL") return new Set<string>();
        return new Set(selectedType.split("|").filter(Boolean));
    }, [selectedType]);
    const isAllTypes = selectedTypeSet.size === 0;

    const typeLabel = isAllTypes
        ? "Tutti"
        : selectedTypeSet.size === 1
            ? Array.from(selectedTypeSet)[0]
            : `${selectedTypeSet.size} tipi`;

    const toggleType = (type: string) => {
        const next = new Set(selectedTypeSet);
        if (next.has(type)) next.delete(type); else next.add(type);
        // Nessuno o tutti selezionati -> "ALL"
        if (next.size === 0 || next.size === uniqueTypes.length) {
            onTypeChange("ALL");
        } else {
            onTypeChange(Array.from(next).join("|"));
        }
    };

    // Filter assets
    const filteredAssets = useMemo(() => {
        let result = assets;

        // Filter by Type (multi-selezione: l'asset passa se il suo tipo è nel set)
        if (!isAllTypes) {
            result = result.filter(asset => {
                const type = asset.asset_class || "Altro";
                return selectedTypeSet.has(type);
            });
        }

        // Filter by Trend
        if (selectedTrend !== "ALL") {
            result = result.filter(asset => {
                const variation = asset.last_trend_variation || 0;
                if (selectedTrend === "POSITIVE") {
                    return variation >= threshold;
                } else if (selectedTrend === "NEGATIVE") {
                    return variation <= -threshold;
                } else if (selectedTrend === "NEUTRAL") {
                    return Math.abs(variation) < threshold;
                }
                return true;
            });
        }

        return result;
    }, [assets, selectedTypeSet, isAllTypes, selectedTrend, threshold]);

    // Aggregato (P&L + MWR%) calcolato sugli asset attualmente filtrati/visibili.
    // L'MWR combinato è un XIRR sui flussi messi insieme -> serve il backend.
    const [agg, setAgg] = useState<{ pnl: number; mwr: number | null } | null>(null);
    const [aggLoading, setAggLoading] = useState(false);
    const filteredIsins = useMemo(() => filteredAssets.map(a => a.isin), [filteredAssets]);

    useEffect(() => {
        if (!selectedPortfolioId || filteredIsins.length === 0) {
            setAgg(null);
            return;
        }
        let cancelled = false;
        setAggLoading(true);
        const timer = setTimeout(() => {
            axios.post(`/api/portfolio/${selectedPortfolioId}/aggregate`, { isins: filteredIsins })
                .then(res => { if (!cancelled) setAgg({ pnl: res.data.pnl, mwr: res.data.mwr }); })
                .catch(() => { if (!cancelled) setAgg(null); })
                .finally(() => { if (!cancelled) setAggLoading(false); });
        }, 300);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [selectedPortfolioId, filteredIsins]);

    // Ordina la lista filtrata (i MWR null finiscono sempre in fondo)
    const sortedAssets = useMemo(() => {
        const arr = [...filteredAssets];
        const mul = sortDir === 'asc' ? 1 : -1;
        arr.sort((a, b) => {
            if (sortKey === 'name') {
                return getAssetDisplayName(a).localeCompare(getAssetDisplayName(b)) * mul;
            }
            if (sortKey === 'type') {
                return (a.asset_class || 'Altro').localeCompare(b.asset_class || 'Altro') * mul;
            }
            // sortKey === 'mwr'
            const am = a.mwr, bm = b.mwr;
            const aNull = am === null || am === undefined;
            const bNull = bm === null || bm === undefined;
            if (aNull && bNull) return 0;
            if (aNull) return 1;
            if (bNull) return -1;
            return ((am as number) - (bm as number)) * mul;
        });
        return arr;
    }, [filteredAssets, sortKey, sortDir]);

    // Auto-select first asset if current selection is filtered out
    useEffect(() => {
        if (sortedAssets.length > 0) {
            const currentInList = sortedAssets.find(a => a.isin === selectedIsin);
            if (!currentInList) {
                // Select the first one
                onSelect(sortedAssets[0].isin);
            }
        } else if (selectedIsin) {
            // Optional: Deselect if list is empty? Or keep previous? 
            // User said: "or the first of the list", implies if list has items.
            // If list empty, maybe nothing to select.
        }
    }, [sortedAssets, selectedIsin, onSelect]);

    return (
        <Card className="h-full flex flex-col bg-card/80 backdrop-blur-xl border-white/40 shadow-sm relative">
            <CardHeader className="px-4 py-3 border-b border-white/40 shrink-0 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xl font-bold text-muted-foreground uppercase tracking-wider shrink-0">
                    Asset ({filteredAssets.length})
                </CardTitle>

                {/* Aggregato sugli asset filtrati: P&L + MWR% */}
                <div className="flex items-center gap-5 min-w-0">
                    {aggLoading && !agg ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : agg ? (
                        <>
                            <div className="flex flex-col items-start leading-tight">
                                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">P&amp;L</span>
                                <span className={cn("text-sm font-bold tabular-nums", agg.pnl >= 0 ? "text-green-500" : "text-red-500")}>
                                    €{formatSwissMoney(agg.pnl)}
                                </span>
                            </div>
                            <div className="flex flex-col items-start leading-tight">
                                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">MWR</span>
                                <span className={cn("text-sm font-bold tabular-nums",
                                    agg.mwr == null ? "text-muted-foreground" : agg.mwr >= 0 ? "text-green-500" : "text-red-500")}>
                                    {agg.mwr != null ? `${formatSwissNumber(agg.mwr, 2)}%` : "—"}
                                </span>
                            </div>
                        </>
                    ) : null}
                </div>

                <div className="flex gap-2 min-w-0 shrink-0">
                    <div className="w-[100px] shrink-0">
                        <Select value={selectedTrend} onValueChange={onTrendChange}>
                            <SelectTrigger className="h-8 bg-white/5 border-white/20 text-xs w-full">
                                <SelectValue placeholder="Trend" />
                            </SelectTrigger>
                            <SelectContent align="end">
                                <SelectItem value="ALL">-</SelectItem>
                                <SelectItem value="POSITIVE">Positivo</SelectItem>
                                <SelectItem value="NEGATIVE">Negativo</SelectItem>
                                <SelectItem value="NEUTRAL">Neutro</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="w-[120px] lg:w-[160px] shrink-0">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    className="h-8 w-full px-3 bg-white/5 border border-white/20 rounded-md text-xs flex items-center justify-between gap-1 hover:bg-white/10 transition-colors focus:outline-none"
                                >
                                    <span className="truncate">{typeLabel}</span>
                                    <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="max-h-[60vh] overflow-y-auto">
                                <DropdownMenuCheckboxItem
                                    checked={isAllTypes}
                                    onCheckedChange={() => onTypeChange("ALL")}
                                    onSelect={(e) => e.preventDefault()}
                                >
                                    Tutti
                                </DropdownMenuCheckboxItem>
                                {uniqueTypes.map((type) => (
                                    <DropdownMenuCheckboxItem
                                        key={type}
                                        checked={selectedTypeSet.has(type)}
                                        onCheckedChange={() => toggleType(type)}
                                        onSelect={(e) => e.preventDefault()}
                                    >
                                        {type}
                                    </DropdownMenuCheckboxItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </CardHeader>

            {/* Header di ordinamento (cliccabile) allineato alle colonne della riga */}
            <div className="flex items-center gap-2 px-5 py-1.5 border-b border-white/10 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground select-none">
                <button type="button" onClick={() => toggleSort('name')} className="flex-1 min-w-0 text-left flex items-center gap-1 hover:text-foreground transition-colors">
                    Asset {sortKey === 'name' && (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                </button>
                <button type="button" onClick={() => toggleSort('mwr')} className="w-[84px] shrink-0 text-left flex items-center justify-start gap-1 hover:text-foreground transition-colors">
                    MWR% {sortKey === 'mwr' && (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                </button>
                <button type="button" onClick={() => toggleSort('type')} className="w-[185px] shrink-0 text-right flex items-center justify-end gap-1 hover:text-foreground transition-colors">
                    Tipo {sortKey === 'type' && (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/40 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/60">
                <CardContent className="p-2 flex flex-col gap-1">
                    {sortedAssets.map((asset) => {
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
                                <div className="flex items-center w-full gap-2">
                                    {/* Sinistra: nome + ISIN */}
                                    <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                                        <span className={cn(
                                            "font-medium text-sm truncate",
                                            isSelected
                                                ? "text-primary"
                                                : (isSignificant ? trendColor : "text-foreground")
                                        )}>
                                            {displayName}
                                        </span>
                                        <span className="text-[11px] text-muted-foreground font-mono opacity-70 truncate">
                                            {asset.isin}
                                        </span>
                                    </div>

                                    {/* Centro: MWR% (verde/rosso per segno) */}
                                    {(() => {
                                        const m = asset.mwr;
                                        const hasM = m !== null && m !== undefined;
                                        const mwrColor = !hasM
                                            ? "text-muted-foreground"
                                            : (m > 0 ? "text-green-500" : m < 0 ? "text-red-500" : "text-muted-foreground");
                                        return (
                                            <span className={cn("w-[84px] shrink-0 text-left text-sm font-semibold tabular-nums", mwrColor)}>
                                                {hasM ? `${formatSwissNumber(m, 2)}%` : "N.D."}
                                            </span>
                                        );
                                    })()}

                                    {/* Destra: badge tipologia (colonna a larghezza fissa per incolonnare il MWR%) */}
                                    <div className="w-[185px] shrink-0 flex justify-end">
                                        {asset.asset_class && (
                                            <span className="bg-white/10 px-1 rounded text-[9px] uppercase tracking-wide text-muted-foreground font-mono opacity-70 truncate">
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
