'use client';

import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { usePortfolio } from "@/context/PortfolioContext";
import { PanelHeader } from "@/components/layout/PanelHeader";
import { AnalysisPieChart } from "@/components/charts/AnalysisPieChart";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, TrendingUp, TrendingDown, DollarSign, PieChart as PieChartIcon, Activity } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

// Palette for specific components requested by user
const COMPONENT_COLORS: Record<string, string> = {
    "Obbligazionaria Governativa": "#10b981", // Green 500
    "Obbligazionaria Corporate": "#34d399",   // Emerald 400
    "Altro": "#94a3b8",                       // Slate 400 (Grey)
    "Liquidità": "#06b6d4",                   // Cyan 500 (Light Blue)
    "Azionaria": "#ef4444",                   // Red 500
    "Commodity": "#eab308",                   // Yellow 500
};

// Fallback palette
const FALLBACK_Colors = ["#8b5cf6", "#ec4899", "#f97316", "#84cc16"];

function getComponentColor(name: string, index: number) {
    if (COMPONENT_COLORS[name]) return COMPONENT_COLORS[name];
    return FALLBACK_Colors[index % FALLBACK_Colors.length];
}

interface AssetDetail {
    name: string;
    isin: string;
    value: number;
    percent_of_component: number;
}

interface ComponentData {
    name: string;
    value: number;
    percentage: number;
    invested: number;
    pl_value: number;
    pl_percent: number;
    mwr: number;
    assets: AssetDetail[];
}

interface AnalysisData {
    total_portfolio_value: number;
    components: ComponentData[];
}

export default function AnalyticsPage() {
    const { selectedPortfolioId } = usePortfolio();
    const [data, setData] = useState<AnalysisData | null>(null);
    const [loading, setLoading] = useState(false);
    const [selectedSlice, setSelectedSlice] = useState<ComponentData | null>(null);

    useEffect(() => {
        if (!selectedPortfolioId) {
            setData(null);
            return;
        }

        const fetchData = async () => {
            setLoading(true);
            try {
                const res = await axios.get(`/api/analysis/allocation?portfolio_id=${selectedPortfolioId}`);
                setData(res.data);
            } catch (error) {
                console.error("Failed to fetch analysis data", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [selectedPortfolioId]);

    // Prepare chart data with colors
    const chartData = useMemo(() => data?.components.map((c, i) => ({
        ...c,
        color: getComponentColor(c.name, i)
    })) || [], [data]);

    if (!selectedPortfolioId) {
        return (
            <div className="flex flex-1 flex-col h-full bg-background/50 p-6">
                <PanelHeader title="Analisi Portafoglio" />
                <div className="flex flex-1 items-center justify-center text-muted-foreground">
                    Seleziona un portafoglio per visualizzare l'analisi.
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex flex-1 flex-col h-full bg-background/50 p-6 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!data || data.components.length === 0) {
        return (
            <div className="flex flex-1 flex-col h-full bg-background/50 p-6">
                <PanelHeader title="Analisi Portafoglio" />
                <div className="flex flex-1 items-center justify-center text-muted-foreground">
                    Nessun dato disponibile per l'analisi. Carica delle transazioni.
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-background/50 p-6 overflow-hidden">
            <PanelHeader title="Analisi Portafoglio" />

            <div className="flex flex-1 items-stretch gap-6 min-h-0">
                {/* Main Content Area: Chart (Left) and Asset Details (Right) */}

                {/* LEFT: Chart */}
                <Card className="flex-[2] bg-card/80 backdrop-blur-xl border-white/40 shadow-xl overflow-hidden flex flex-col relative">
                    <CardHeader className="absolute top-6 left-6 z-10 w-auto">
                        <CardTitle className="flex items-center gap-3 text-xl whitespace-nowrap">
                            <PieChartIcon className="h-10 w-10 text-indigo-400" />
                            Allocazione per Componente
                        </CardTitle>
                        <CardDescription className="text-sm max-w-[300px] whitespace-nowrap">
                            Suddivisione del portafoglio in base alla macro-tipologia degli asset.
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="flex-1 flex items-center justify-start min-h-0 relative pl-2">
                        {/* Background Glow Effect */}
                        <div className="absolute top-1/2 left-[30%] -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-indigo-500/5 blur-[120px] rounded-full pointer-events-none" />

                        <div className="w-[55%] h-full max-h-[600px]">
                            <AnalysisPieChart
                                data={chartData}
                                onSelect={(item) => setSelectedSlice(item as ComponentData)}
                                colors={[]} // Not needed as we pass color in data
                            />
                        </div>
                    </CardContent>

                    {/* Overlay Component List on the Right side of the Chart Area (Simulating the user image layout) */}
                    {selectedSlice && (
                        <div className="absolute top-6 bottom-6 right-4 w-[53%] z-20 flex flex-col">
                            <Card className="bg-slate-950/80 backdrop-blur-md border-white/40 shadow-2xl h-full flex flex-col">
                                <CardHeader className="py-3 px-4 border-b border-white/40 bg-white/5">
                                    <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                        Lista asset Componente - <span style={{ color: getComponentColor(selectedSlice.name, 0) }}>{selectedSlice.name}</span>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-5 overflow-y-auto custom-scrollbar flex-1">
                                    {selectedSlice.assets && selectedSlice.assets.map((asset) => (
                                        <div key={asset.isin} className="flex items-center justify-between p-3 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                {/* Check icon (fake) */}
                                                <div className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/50">
                                                    <div className="w-1.5 h-2.5 border-r-2 border-b-2 border-emerald-400 rotate-45 -mt-0.5" />
                                                </div>
                                                <span className="text-sm truncate text-slate-200" title={asset.name}>
                                                    <span className="font-medium">{asset.name}</span>
                                                    <span className="ml-1 text-slate-400 font-normal">({asset.isin})</span>
                                                </span>
                                            </div>
                                            <div className="text-right flex-shrink-0 text-xs text-muted-foreground">
                                                <span className="font-mono text-white mr-1">
                                                    €{asset.value.toLocaleString('it-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                </span>
                                                <span>({asset.percent_of_component}%)</span>
                                            </div>
                                        </div>
                                    ))}
                                    {(!selectedSlice.assets || selectedSlice.assets.length === 0) && (
                                        <div className="p-4 text-center text-sm text-muted-foreground">
                                            Nessun dettaglio asset disponibile.
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </Card>

                {/* RIGHT: Details & Summary List */}
                <div className="flex-1 flex flex-col gap-6">
                    {/* Detailed Metric Card */}
                    <Card className="bg-card/90 backdrop-blur-xl border-white/40 shadow-xl">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg text-muted-foreground uppercase tracking-widest text-xs">Dettaglio Componente</CardTitle>
                            <div className="text-3xl font-bold truncate" style={{ color: selectedSlice ? getComponentColor(selectedSlice.name, 0) : 'white' }}>
                                {selectedSlice ? selectedSlice.name : "Seleziona..."}
                            </div>
                            {selectedSlice && (
                                <div className="text-sm text-muted-foreground">
                                    {selectedSlice.percentage}% del Totale
                                </div>
                            )}
                        </CardHeader>
                        <Separator className="bg-white/10" />
                        <CardContent className="pt-2 space-y-6">
                            {selectedSlice ? (
                                <>
                                    <div className="grid grid-cols-2 gap-8">
                                        <div className="space-y-1">
                                            <p className="text-xs text-muted-foreground uppercase">Controvalore</p>
                                            <div className="text-2xl font-bold text-white">
                                                €{selectedSlice.value.toLocaleString('it-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                            </div>

                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-xs text-muted-foreground uppercase">MWR Annuo</p>
                                            <div className={`text-2xl font-bold flex items-center gap-1 ${selectedSlice.mwr >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                <Activity className="h-5 w-5" />
                                                {selectedSlice.mwr}%
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-3 pt-2">
                                        <div className="flex justify-between items-center bg-white/5 p-3 rounded-lg border border-white/5">
                                            <span className="text-sm text-slate-400">Investito Netto</span>
                                            <span className="font-mono text-sm font-medium">€{selectedSlice.invested.toLocaleString('it-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                                        </div>
                                        <div className="flex justify-between items-center bg-white/5 p-3 rounded-lg border border-white/5">
                                            <span className="text-sm text-slate-400">P&L Assoluto</span>
                                            <span className={`font-mono text-sm font-bold ${selectedSlice.pl_value >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                {selectedSlice.pl_value >= 0 ? '+' : ''}€{selectedSlice.pl_value.toLocaleString('it-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center bg-white/5 p-3 rounded-lg border border-white/5">
                                            <span className="text-sm text-slate-400">P&L Percentuale</span>
                                            <span className={`font-mono text-sm font-bold ${selectedSlice.pl_percent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                {selectedSlice.pl_percent >= 0 ? '+' : ''}{selectedSlice.pl_percent}%
                                            </span>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                                    Seleziona una sezione del grafico
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Simplified Legend List */}
                    <Card className="flex-initial min-h-0 bg-card/80 backdrop-blur-md border-white/40 shadow-lg overflow-hidden flex flex-col">
                        <CardHeader className="pb-0">
                            <CardTitle className="text-sm font-medium">Riepilogo</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 flex-1 overflow-hidden">
                            <ScrollArea className="h-full px-6 pb-4">
                                <div className="space-y-1 pt-0">
                                    {data.components.map((c, idx) => {
                                        const isSelected = selectedSlice?.name === c.name;
                                        const isFaded = selectedSlice && !isSelected;

                                        return (
                                            <div
                                                key={c.name}
                                                className={`flex items-center justify-between p-3 rounded-xl border transition-all duration-300 cursor-pointer ${isSelected
                                                    ? "bg-white/10 border-indigo-500/50 shadow-lg scale-[1.02]"
                                                    : "bg-transparent border-transparent hover:bg-white/5"
                                                    } ${isFaded ? "opacity-40 grayscale-[0.5]" : "opacity-100"}`}
                                                onClick={() => setSelectedSlice(c)}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-1.5 h-10 rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)]`}
                                                        style={{ backgroundColor: getComponentColor(c.name, idx), boxShadow: isSelected ? `0 0 15px ${getComponentColor(c.name, idx)}` : 'none' }}
                                                    />
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-bold tracking-wide">{c.name}</span>
                                                        <span className="text-[11px] text-muted-foreground font-mono">{c.percentage}%</span>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-sm font-bold tracking-tight">€{c.value.toLocaleString('it-IT', { compactDisplay: 'short', notation: 'compact' })}</div>
                                                    <div className={`text-[10px] font-medium ${c.pl_percent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                        {c.pl_percent > 0 ? '+' : ''}{c.pl_percent}%
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
