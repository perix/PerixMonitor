import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { formatSwissMoney, formatSwissNumber, formatDate } from "@/lib/utils";
import React, { useMemo, useState } from "react";

interface Asset {
    isin: string;
    name: string;
    asset_class?: string;
    latest_price?: number;
    price_date?: string;
    current_qty?: number;
    last_trend_variation?: number;
    last_trend_days?: number;
}

interface PortfolioVariationsModalProps {
    isOpen: boolean;
    onClose: () => void;
    assets: Asset[];
    portfolioName: string;
}

export function PortfolioVariationsModal({ isOpen, onClose, assets, portfolioName }: PortfolioVariationsModalProps) {
    const [hideCertificates, setHideCertificates] = useState(true);

    const { latestDate, prevDate } = useMemo(() => {
        if (!assets || assets.length === 0) return { latestDate: null, prevDate: null };
        
        // Collect all available dates
        const distinctDates = Array.from(new Set(assets.map(a => a.price_date).filter(Boolean))) as string[];
        distinctDates.sort().reverse(); // [latest, second latest, ...]

        const latest = distinctDates[0] ? formatDate(distinctDates[0]) : null;
        let prev = distinctDates[1] ? formatDate(distinctDates[1]) : null;

        // If we only have one date, estimate the previous global date from last_trend_days
        if (!prev && distinctDates[0]) {
            const baseDate = new Date(distinctDates[0]);
            if (!isNaN(baseDate.getTime())) {
                // Find the average/max last_trend_days to estimate the interval date
                const avgDays = assets.reduce((max, a) => Math.max(max, a.last_trend_days || 0), 0);
                if (avgDays > 0) {
                    const prevDateObj = new Date(baseDate);
                    prevDateObj.setDate(baseDate.getDate() - avgDays);
                    prev = formatDate(prevDateObj);
                }
            }
        }

        return { latestDate: latest, prevDate: prev };
    }, [assets]);

    const variationsData = useMemo(() => {
        return assets
            .filter(a => a.last_trend_variation !== undefined && a.last_trend_variation !== null && a.latest_price)
            .map(a => {
                const p1 = a.latest_price || 0;
                const variationPct = a.last_trend_variation || 0;
                const qty = a.current_qty || 0;

                let p2 = p1;
                // Avoid division by zero
                if (variationPct > -100) {
                    p2 = p1 / (1 + variationPct / 100);
                }

                const deltaPrice = p1 - p2;
                const deltaValue = deltaPrice * qty;

                return {
                    isin: a.isin,
                    name: a.name,
                    assetClass: a.asset_class || '',
                    deltaPct: variationPct,
                    deltaValue: deltaValue
                };
            })
            .filter(v => (!hideCertificates || v.assetClass !== 'Certificato') && v.deltaPct !== 0)
            // Sort by asset class (tipologia) alphabetically
            .sort((a, b) => a.assetClass.localeCompare(b.assetClass));
    }, [assets, hideCertificates]);

    // Dynamic Column Width Calculation
    const columnWidths = useMemo(() => {
        if (!variationsData || variationsData.length === 0) {
            return { isin: 120, asset: 200, tipologia: 120, deltaPct: 100, deltaValue: 120 };
        }

        const estimateWidth = (text: string, isMono = false, isBold = false) => {
            if (!text) return 0;
            const charWidth = isMono ? 8.5 : 7.5;
            const boldFactor = isBold ? 1.15 : 1;
            return Math.ceil(text.length * charWidth * boldFactor) + 24;
        };

        const widths = {
            isin: estimateWidth("ISIN", false, true),
            asset: estimateWidth("ASSET", false, true),
            tipologia: estimateWidth("TIPOLOGIA", false, true),
            deltaPct: estimateWidth("DELTA PREZZO %", false, true),
            deltaValue: estimateWidth("DELTA VALORE", false, true)
        };

        variationsData.forEach(v => {
            widths.isin = Math.max(widths.isin, estimateWidth(v.isin, false));
            widths.asset = Math.max(widths.asset, estimateWidth(v.name, false, true));
            widths.tipologia = Math.max(widths.tipologia, estimateWidth(v.assetClass, false, true));
            
            const pctStr = `${v.deltaPct > 0 ? '+' : ''}${v.deltaPct.toFixed(2)}%`;
            widths.deltaPct = Math.max(widths.deltaPct, estimateWidth(pctStr, true));
            
            const valStr = `${v.deltaValue > 0 ? '+' : ''}€${formatSwissMoney(v.deltaValue)}`;
            widths.deltaValue = Math.max(widths.deltaValue, estimateWidth(valStr, true, true));
        });

        // Safety caps
        widths.asset = Math.min(widths.asset, 400);
        widths.tipologia = Math.min(widths.tipologia, 150);
        widths.isin = Math.max(widths.isin, 100);

        return widths;
    }, [variationsData]);

    const getVariationStyle = (val: number) => {
        if (val > 0) return 'text-green-400 group-hover:text-green-700';
        if (val < 0) return 'text-red-400 group-hover:text-red-700';
        return 'text-slate-400 group-hover:text-slate-700';
    };

    const totalDeltaValue = variationsData.reduce((acc, v) => acc + v.deltaValue, 0);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col bg-[#0A0A0A] border-white/40 text-gray-200 shadow-2xl p-0">
                <DialogHeader className="shrink-0 px-6 pt-6 pb-3 flex flex-row items-baseline justify-between">
                    <div>
                        <DialogTitle className="text-lg font-bold">Variazioni Asset - {portfolioName}</DialogTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                            Differenza tra gli ultimi due prezzi registrati {prevDate && latestDate ? `(${prevDate} → ${latestDate})` : ''}
                        </p>
                    </div>
                    <div className="flex items-center space-x-2 mr-6 shrink-0">
                        <Checkbox 
                            id="hide-certs" 
                            checked={hideCertificates} 
                            onCheckedChange={(checked) => setHideCertificates(checked as boolean)}
                            className="border-slate-500 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                        <label htmlFor="hide-certs" className="text-xs font-medium leading-none cursor-pointer select-none text-slate-300">
                            Nascondi Certificati
                        </label>
                    </div>
                </DialogHeader>

                <div className="flex-1 min-h-0 flex flex-col overflow-hidden px-6 pb-6">
                    {variationsData.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                            <p>Nessuna variazione trovata per gli asset di questo portafoglio.</p>
                        </div>
                    ) : (
                        <div className="flex flex-col flex-1 min-h-0">
                            <div className="rounded-md border border-slate-700 overflow-auto flex-1 min-h-0 relative">
                                <Table className="border-collapse" style={{ tableLayout: 'fixed' }}>
                                    <TableHeader className="bg-slate-100 sticky top-0 z-10 shadow-sm outline outline-1 outline-slate-300">
                                        <TableRow className="border-b border-slate-300 hover:bg-slate-100 bg-slate-100">
                                            <TableHead className="border-r border-slate-300 h-10 py-1 text-black font-extrabold text-[10px] uppercase tracking-wider bg-slate-100" style={{ width: columnWidths.isin }}>ISIN</TableHead>
                                            <TableHead className="border-r border-slate-300 h-10 py-1 text-black font-extrabold text-[10px] uppercase tracking-wider bg-slate-100" style={{ width: columnWidths.asset }}>Asset</TableHead>
                                            <TableHead className="border-r border-slate-300 h-10 py-1 text-black font-extrabold text-[10px] uppercase tracking-wider bg-slate-100" style={{ width: columnWidths.tipologia }}>Tipologia</TableHead>
                                            <TableHead className="border-r border-slate-300 h-10 py-1 text-black font-extrabold text-[10px] uppercase tracking-wider text-right bg-slate-100" style={{ width: columnWidths.deltaPct }}>Delta Prezzo %</TableHead>
                                            <TableHead className="h-10 py-1 text-black font-extrabold text-[10px] uppercase tracking-wider text-right bg-slate-100" style={{ width: columnWidths.deltaValue }}>Delta Valore</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {variationsData.map((v) => (
                                            <TableRow
                                                key={v.isin}
                                                className="border-b border-slate-700 text-slate-200 hover:bg-sky-200 hover:text-slate-900 group"
                                            >
                                                <TableCell className="py-1 px-2 border-r border-slate-700 group-hover:border-slate-400 font-medium text-[11px] text-slate-200 group-hover:text-slate-900" style={{ width: columnWidths.isin }}>
                                                    {v.isin}
                                                </TableCell>
                                                <TableCell className="py-1 px-2 border-r border-slate-700 group-hover:border-slate-400 font-medium text-[13px] truncate" title={v.name} style={{ width: columnWidths.asset }}>
                                                    {v.name || 'Sconosciuto'}
                                                </TableCell>
                                                <TableCell className="py-1 px-2 border-r border-slate-700 group-hover:border-slate-400 text-[10px] uppercase text-slate-400 group-hover:text-slate-700 font-bold leading-tight" style={{ width: columnWidths.tipologia }}>
                                                    {v.assetClass}
                                                </TableCell>
                                                <TableCell className={`py-1 px-2 border-r border-slate-700 group-hover:border-slate-400 text-right font-mono text-[13px] font-bold ${getVariationStyle(v.deltaPct)}`} style={{ width: columnWidths.deltaPct }}>
                                                    {v.deltaPct > 0 ? '+' : ''}{v.deltaPct.toFixed(2)}%
                                                </TableCell>
                                                <TableCell className={`py-1 px-2 text-right font-mono text-[13px] font-bold ${getVariationStyle(v.deltaValue)}`} style={{ width: columnWidths.deltaValue }}>
                                                    {v.deltaValue > 0 ? '+' : ''}€{formatSwissMoney(v.deltaValue)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}
                </div>

                {variationsData.length > 0 && (
                    <div className="shrink-0 px-6 py-3 border-t border-slate-700 bg-slate-900/40 flex justify-between items-center text-sm">
                        <div className="flex gap-6 items-center">
                            <div className="flex flex-col">
                                <span className="text-[10px] uppercase text-slate-500 font-bold">Totale Variazione Valore</span>
                                <span className={`font-mono font-bold ${totalDeltaValue > 0 ? 'text-green-400' : totalDeltaValue < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                                    {totalDeltaValue > 0 ? '+' : ''}€{formatSwissMoney(totalDeltaValue)}
                                </span>
                            </div>
                        </div>
                        <div className="text-xs text-slate-500">
                            {variationsData.length} asset analizzati
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
