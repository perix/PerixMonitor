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
import { Button } from "@/components/ui/button";
import { Loader2, FileText, Download } from "lucide-react";
import { usePortfolioMovements } from "@/hooks/usePortfolioMovements";
import { formatSwissMoney, formatSwissNumber, parseISODateLocal } from "@/lib/utils";
import React from "react";
import * as XLSX from "xlsx";

interface PeriodOperationsModalProps {
    isOpen: boolean;
    onClose: () => void;
    portfolioId: string | null;
    portfolioName: string;
    startDate: string;
    endDate: string;
}

export function PeriodOperationsModal({ isOpen, onClose, portfolioId, portfolioName, startDate, endDate }: PeriodOperationsModalProps) {
    const [showDividends, setShowDividends] = React.useState(false);

    // Convert to YYYY-MM-DD for API
    const formatForApi = (isoString: string) => {
        if (!isoString) return "";
        return isoString.split('T')[0];
    };

    const apiStart = formatForApi(startDate);
    const apiEnd = formatForApi(endDate);

    const { movements, isLoading, error } = usePortfolioMovements(
        portfolioId,
        apiStart,
        apiEnd,
        showDividends,
        isOpen
    );

    const getOperationStyle = (type: string) => {
        switch (type.toLowerCase()) {
            case 'acquisto':
                return 'text-green-400 group-hover:text-green-700';
            case 'vendita':
                return 'text-red-400 group-hover:text-red-700';
            case 'cedola/dividendo':
                return 'text-blue-400 group-hover:text-blue-700';
            default:
                return 'text-orange-400 group-hover:text-orange-700';
        }
    };

    const formatDisplayDate = (dateStr: string) => {
        const d = parseISODateLocal(dateStr);
        return d ? d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : dateStr;
    };

    const periodStr = `${formatDisplayDate(startDate)} - ${formatDisplayDate(endDate)}`;

    // Dynamic Column Width Calculation
    const columnWidths = React.useMemo(() => {
        if (!movements || movements.length === 0) return { date: 90, isin: 100, tipologia: 120, tipoOp: 110, qty: 90, val: 110 };

        // Helper to estimate width based on characters and font type
        const estimateWidth = (text: string, isMono = false, isBold = false) => {
            if (!text) return 0;
            const charWidth = isMono ? 8.5 : 7.5; // Average char widths for 13px/11px
            const boldFactor = isBold ? 1.15 : 1;
            return Math.ceil(text.length * charWidth * boldFactor) + 24; // + padding
        };

        const widths = {
            date: estimateWidth("00/00/0000", true), // Fixed format
            isin: 0,
            tipologia: 0,
            tipoOp: 0,
            qty: 0,
            val: 0
        };

        // Header minimums
        widths.isin = estimateWidth("ISIN", false, true);
        widths.tipologia = estimateWidth("TIPOLOGIA", false, true);
        widths.tipoOp = estimateWidth("TIPO OP.", false, true);
        widths.qty = estimateWidth("QUANTITÀ", false, true);
        widths.val = estimateWidth("VALORE (€)", false, true);

        // Data-driven maximums
        movements.forEach(m => {
            widths.isin = Math.max(widths.isin, estimateWidth(m.isin || "", false));
            widths.tipologia = Math.max(widths.tipologia, estimateWidth(m.asset_class || "", false, true));
            widths.tipoOp = Math.max(widths.tipoOp, estimateWidth(m.type || "", false, true));
            
            const qtyStr = m.quantity !== null ? formatSwissNumber(m.quantity, 4) : "—";
            widths.qty = Math.max(widths.qty, estimateWidth(qtyStr, true));
            
            const valStr = `€${formatSwissMoney(m.value)}`;
            widths.val = Math.max(widths.val, estimateWidth(valStr, true, true));
        });

        // Safety caps to prevent over-expansion
        widths.tipologia = Math.min(widths.tipologia, 200);
        widths.tipoOp = Math.min(widths.tipoOp, 150);
        widths.isin = Math.max(widths.isin, 100);

        return widths;
    }, [movements]);

    const totals = React.useMemo(() => {
        if (!movements) return { buys: 0, sells: 0, dividends: 0 };
        return movements.reduce((acc, m) => {
            const typeLower = m.type.toLowerCase();
            if (typeLower === 'acquisto') acc.buys += m.value;
            else if (typeLower === 'vendita') acc.sells += m.value;
            else if (typeLower === 'cedola/dividendo' || typeLower === 'dividendo' || typeLower === 'cedola') acc.dividends += m.value;
            return acc;
        }, { buys: 0, sells: 0, dividends: 0 });
    }, [movements]);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-4xl lg:max-w-5xl max-h-[85vh] flex flex-col bg-[#0A0A0A] border-white/40 text-gray-200 shadow-2xl p-0">
                <DialogHeader className="shrink-0 px-6 pt-6 pb-3 flex flex-row items-baseline justify-between">
                    <div>
                        <DialogTitle className="text-lg font-bold">Movimenti nel periodo selezionato</DialogTitle>
                        <p className="text-sm text-muted-foreground mt-1">{periodStr}</p>
                    </div>
                    <div className="flex items-center space-x-4 mr-6">
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="show-dividends"
                                checked={showDividends}
                                onCheckedChange={(checked) => setShowDividends(checked as boolean)}
                                className="border-slate-500 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                            />
                            <label
                                htmlFor="show-dividends"
                                className="text-xs font-medium leading-none cursor-pointer select-none text-slate-300"
                            >
                                Mostra Cedole/Dividendi
                            </label>
                        </div>
                        <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-8 border-slate-700 bg-slate-900/50 hover:bg-slate-800 hover:text-white text-xs"
                            onClick={() => {
                                if (!movements || movements.length === 0) return;
                                
                                const dataToExport = movements.map(m => ({
                                    "Data": formatDisplayDate(m.date),
                                    "ISIN": m.isin || '',
                                    "Asset": m.description || 'Sconosciuto',
                                    "Tipologia": m.asset_class || '',
                                    "Tipo Op.": m.type || '',
                                    "Quantità": m.quantity !== null && m.quantity !== undefined ? m.quantity : '',
                                    "Valore (€)": m.value !== null && m.value !== undefined ? m.value : ''
                                }));
                                
                                const worksheet = XLSX.utils.json_to_sheet(dataToExport);
                                const workbook = XLSX.utils.book_new();
                                XLSX.utils.book_append_sheet(workbook, worksheet, "Movimenti");
                                
                                const formatFileDate = (isoStr: string) => {
                                    if (!isoStr) return "";
                                    const parts = isoStr.split('T')[0].split('-');
                                    return parts.length === 3 ? `${parts[2]}${parts[1]}${parts[0]}` : isoStr.replace(/-/g, '');
                                };
                                
                                const startDateStr = formatFileDate(startDate);
                                const endDateStr = formatFileDate(endDate);
                                const safeName = portfolioName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                                
                                XLSX.writeFile(workbook, `${safeName}-${startDateStr}_${endDateStr}.xlsx`);
                            }}
                            disabled={!movements || movements.length === 0}
                        >
                            <Download className="mr-2 h-4 w-4" />
                            Esporta
                        </Button>
                    </div>
                </DialogHeader>

                <div className="flex-1 min-h-0 flex flex-col overflow-hidden px-6 pb-6">
                    {error && (
                        <div className="p-4 border border-red-500/30 bg-red-500/10 text-red-400 rounded-md text-sm mb-4">
                            Errore: {error}
                        </div>
                    )}

                    {isLoading ? (
                        <div className="flex-1 flex items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <span className="ml-3 text-muted-foreground">Caricamento movimenti...</span>
                        </div>
                    ) : movements.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                            <FileText className="h-12 w-12 mb-2 opacity-20" />
                            <p>Nessun movimento trovato nel periodo selezionato.</p>
                        </div>
                    ) : (
                        <div className="flex flex-col flex-1 min-h-0">
                            <div className="rounded-md border border-slate-700 overflow-auto flex-1 min-h-0 relative">
                                <Table className="border-collapse" style={{ tableLayout: 'fixed' }}>
                                    <TableHeader className="bg-slate-100 sticky top-0 z-10 shadow-sm outline outline-1 outline-slate-300">
                                        <TableRow className="border-b border-slate-300 hover:bg-slate-100 bg-slate-100">
                                            <TableHead className="border-r border-slate-300 h-10 py-1 text-black font-extrabold text-[10px] uppercase tracking-wider bg-slate-100" style={{ width: columnWidths.date }}>Data</TableHead>
                                            <TableHead className="border-r border-slate-300 h-10 py-1 text-black font-extrabold text-[10px] uppercase tracking-wider bg-slate-100" style={{ width: columnWidths.isin }}>ISIN</TableHead>
                                            <TableHead className="border-r border-slate-300 h-10 py-1 text-black font-extrabold text-[10px] uppercase tracking-wider bg-slate-100">Asset</TableHead>
                                            <TableHead className="border-r border-slate-300 h-10 py-1 text-black font-extrabold text-[10px] uppercase tracking-wider bg-slate-100" style={{ width: columnWidths.tipologia }}>Tipologia</TableHead>
                                            <TableHead className="border-r border-slate-300 h-10 py-1 text-black font-extrabold text-[10px] uppercase tracking-wider bg-slate-100" style={{ width: columnWidths.tipoOp }}>Tipo Op.</TableHead>
                                            <TableHead className="border-r border-slate-300 h-10 py-1 text-black font-extrabold text-[10px] uppercase tracking-wider text-right bg-slate-100" style={{ width: columnWidths.qty }}>Quantità</TableHead>
                                            <TableHead className="h-10 py-1 text-black font-extrabold text-[10px] uppercase tracking-wider text-right bg-slate-100" style={{ width: columnWidths.val }}>Valore (€)</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {movements.map((m, idx) => (
                                            <TableRow
                                                key={`${m.date}-${idx}`}
                                                className="border-b border-slate-700 text-slate-200 hover:bg-sky-200 hover:text-slate-900 group"
                                            >
                                                <TableCell className="py-1 px-2 border-r border-slate-700 group-hover:border-slate-400 font-mono text-[13px]" style={{ width: columnWidths.date }}>
                                                    {formatDisplayDate(m.date)}
                                                </TableCell>
                                                <TableCell className="py-1 px-2 border-r border-slate-700 group-hover:border-slate-400 font-medium text-[11px] text-slate-200 group-hover:text-slate-900" style={{ width: columnWidths.isin }}>
                                                    {m.isin}
                                                </TableCell>
                                                <TableCell className="py-1 px-2 border-r border-slate-700 group-hover:border-slate-400 font-medium text-[13px] truncate" title={m.description}>
                                                    {m.description || 'Sconosciuto'}
                                                </TableCell>
                                                <TableCell className="py-1 px-2 border-r border-slate-700 group-hover:border-slate-400 text-[10px] uppercase text-slate-400 group-hover:text-slate-700 font-bold leading-tight" style={{ width: columnWidths.tipologia }}>
                                                    {m.asset_class}
                                                </TableCell>
                                                <TableCell className={`py-1 px-2 border-r border-slate-700 group-hover:border-slate-400 font-medium text-[13px] ${getOperationStyle(m.type)}`} style={{ width: columnWidths.tipoOp }}>
                                                    {m.type}
                                                </TableCell>
                                                <TableCell className="py-1 px-2 border-r border-slate-700 group-hover:border-slate-400 text-right font-mono text-[13px]" style={{ width: columnWidths.qty }}>
                                                    {m.quantity !== null && m.quantity !== undefined ? formatSwissNumber(m.quantity, 4) : '—'}
                                                </TableCell>
                                                <TableCell className="py-1 px-2 text-right font-mono text-[13px] font-medium" style={{ width: columnWidths.val }}>
                                                    €{formatSwissMoney(m.value)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}
                </div>

                {!isLoading && !error && movements.length > 0 && (
                    <div className="shrink-0 px-6 py-3 border-t border-slate-700 bg-slate-900/40 flex justify-between items-center text-sm">
                        <div className="flex gap-6">
                            <div className="flex flex-col">
                                <span className="text-[10px] uppercase text-slate-500 font-bold">Totale Acquisti</span>
                                <span className="text-green-400 font-mono font-bold">€{formatSwissMoney(totals.buys)}</span>
                            </div>
                            <div className="flex flex-col border-l border-slate-700 pl-6">
                                <span className="text-[10px] uppercase text-slate-500 font-bold">Totale Vendite</span>
                                <span className="text-red-400 font-mono font-bold">€{formatSwissMoney(totals.sells)}</span>
                            </div>
                            {showDividends && (
                                <div className="flex flex-col border-l border-slate-700 pl-6">
                                    <span className="text-[10px] uppercase text-slate-500 font-bold">Totale Cedole/Div.</span>
                                    <span className="text-blue-400 font-mono font-bold">€{formatSwissMoney(totals.dividends)}</span>
                                </div>
                            )}
                        </div>
                        <div className="text-xs text-slate-500">
                            {movements.length} moviment{movements.length === 1 ? 'o' : 'i'} trovati
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

