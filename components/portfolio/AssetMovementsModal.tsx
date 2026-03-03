'use client';

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { useAssetMovements, Movement } from "@/hooks/useAssetMovements";
import { formatSwissMoney, formatSwissNumber } from "@/lib/utils";

interface AssetMovementsModalProps {
    portfolioId: string;
    assetId: string;
    assetName: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/**
 * Returns color classes for each operation type.
 */
function getOperationStyle(operation: string): string {
    switch (operation) {
        case 'Acquisto':
            return 'text-green-400 group-hover:text-green-700';
        case 'Vendita':
            return 'text-red-400 group-hover:text-red-700';
        case 'Cedola/Dividendo':
            return 'text-blue-400 group-hover:text-blue-700';
        case 'Fee':
            return 'text-orange-400 group-hover:text-orange-700';
        default:
            return '';
    }
}

/**
 * Formats a date string (YYYY-MM-DD) to Italian locale format (DD/MM/YYYY).
 */
function formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '-';
    try {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        return dateStr;
    } catch {
        return dateStr;
    }
}

/**
 * Returns the cash flow value for display.
 * Acquisto = cash outflow = negative
 * Vendita/Cedola/Dividendo = cash inflow = positive
 * Fee = cash outflow = negative
 */
function getCashFlowValue(m: Movement): number {
    if (m.operation === 'Acquisto') return -Math.abs(m.value);
    if (m.operation === 'Fee') return -Math.abs(m.value);
    return Math.abs(m.value);
}

/**
 * Reusable modal component that displays asset movements in a table.
 * Uses the same visual style as the MemoryTable (Note & Storico page).
 */
export function AssetMovementsModal({
    portfolioId,
    assetId,
    assetName,
    open,
    onOpenChange,
}: AssetMovementsModalProps) {
    const { movements, isLoading, error } = useAssetMovements(
        portfolioId,
        assetId,
        open
    );

    const netBalance = movements.reduce((sum, m) => sum + getCashFlowValue(m), 0);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="sm:max-w-xl lg:max-w-2xl max-h-[80vh] flex flex-col bg-[#0A0A0A] border-white/40 text-gray-200 shadow-2xl p-0"
                showCloseButton={true}
            >
                <DialogHeader className="shrink-0 px-6 pt-6 pb-3">
                    <DialogTitle className="text-lg font-bold">
                        Movimenti — {assetName}
                    </DialogTitle>
                    <DialogDescription className="text-sm text-muted-foreground">
                        Storico completo delle transazioni e dei flussi di cassa per questo asset.
                    </DialogDescription>
                </DialogHeader>

                {/* Content area */}
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden px-6">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <span className="ml-3 text-muted-foreground">Caricamento movimenti...</span>
                        </div>
                    ) : error ? (
                        <div className="p-4 border border-red-500/30 bg-red-500/10 text-red-400 rounded-md">
                            Errore: {error}
                        </div>
                    ) : (
                        <div className="flex flex-col flex-1 min-h-0">
                            {/* Fixed Header — same style as MemoryTable */}
                            <div className="rounded-t-md border border-slate-700 flex-shrink-0">
                                <Table className="border-collapse" style={{ tableLayout: 'fixed' }}>
                                    <TableHeader className="bg-slate-100">
                                        <TableRow className="border-b border-slate-300 hover:bg-slate-100">
                                            <TableHead className="border-r border-slate-300 h-10 py-1 text-black font-extrabold text-xs uppercase tracking-wider" style={{ width: 110 }}>
                                                Data
                                            </TableHead>
                                            <TableHead className="border-r border-slate-300 h-10 py-1 text-black font-extrabold text-xs uppercase tracking-wider" style={{ width: 140 }}>
                                                Operazione
                                            </TableHead>
                                            <TableHead className="border-r border-slate-300 h-10 py-1 text-black font-extrabold text-xs uppercase tracking-wider text-right" style={{ width: 110 }}>
                                                Quantità
                                            </TableHead>
                                            <TableHead className="h-10 py-1 text-black font-extrabold text-xs uppercase tracking-wider text-right" style={{ width: 130 }}>
                                                Valore (€)
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                </Table>
                            </div>

                            {/* Scrollable Body — same style as MemoryTable */}
                            <div className="rounded-b-md border-x border-b border-slate-700 overflow-auto flex-1 min-h-0">
                                <Table className="border-collapse" style={{ tableLayout: 'fixed' }}>
                                    <TableBody>
                                        {movements.map((m: Movement, idx: number) => {
                                            const cashFlow = getCashFlowValue(m);
                                            const isNegative = cashFlow < 0;
                                            const valueColor = isNegative ? 'text-red-400 group-hover:text-red-700' : 'text-slate-200 group-hover:text-slate-900';

                                            return (
                                                <TableRow
                                                    key={`${m.date}-${m.operation}-${idx}`}
                                                    className="border-b border-slate-700 text-slate-200 hover:bg-sky-200 hover:text-slate-900 group"
                                                >
                                                    <TableCell className="py-1 px-2 border-r border-slate-700 group-hover:border-slate-400 font-mono text-sm" style={{ width: 110 }}>
                                                        {formatDate(m.date)}
                                                    </TableCell>
                                                    <TableCell className={`py-1 px-2 border-r border-slate-700 group-hover:border-slate-400 font-medium text-sm ${getOperationStyle(m.operation)}`} style={{ width: 140 }}>
                                                        {m.operation}
                                                    </TableCell>
                                                    <TableCell className="py-1 px-2 border-r border-slate-700 group-hover:border-slate-400 text-right font-mono text-sm" style={{ width: 110 }}>
                                                        {m.quantity !== null && m.quantity !== undefined
                                                            ? formatSwissNumber(m.quantity, 4)
                                                            : '—'}
                                                    </TableCell>
                                                    <TableCell className={`py-1 px-2 group-hover:border-slate-400 text-right font-mono text-sm font-medium ${valueColor}`} style={{ width: 130 }}>
                                                        {isNegative ? '-' : ''}€{formatSwissMoney(Math.abs(cashFlow))}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer with summary */}
                {!isLoading && !error && movements.length > 0 && (
                    <div className="shrink-0 px-6 py-3 border-t border-slate-700 text-xs text-gray-400 flex justify-between items-center">
                        <span>{movements.length} moviment{movements.length === 1 ? 'o' : 'i'} totali</span>
                        <span>
                            Saldo netto:{' '}
                            <span className={`font-mono font-medium ${netBalance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {netBalance < 0 ? '-' : ''}€{formatSwissMoney(Math.abs(netBalance))}
                            </span>
                        </span>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
