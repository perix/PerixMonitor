import { useState, useEffect, useMemo, useRef } from "react";
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
import { Loader2, Trash2, Save, X, AlertTriangle } from "lucide-react";
import { useAssetPrices, AssetPrice } from "@/hooks/useAssetPrices";
import { formatSwissMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { usePortfolio } from "@/context/PortfolioContext";

interface AssetPricesModalProps {
    portfolioId: string;
    assetId: string;
    assetName: string;
    isin: string; // ISIN required for sync
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

interface EditablePrice extends AssetPrice {
    id: string; // local id to track uniquely
    isDeleted?: boolean;
    isModified?: boolean;
    originalDate: string;
    originalSource: string;
    originalPrice: number;
}

export function AssetPricesModal({
    portfolioId,
    assetId,
    assetName,
    isin,
    open,
    onOpenChange,
}: AssetPricesModalProps) {
    const [range, setRange] = useState<number | null>(365);
    const { invalidateCache } = usePortfolio();
    const { prices, isLoading, error, syncPrices } = useAssetPrices(
        portfolioId,
        assetId,
        open,
        range
    );

    const [localPrices, setLocalPrices] = useState<EditablePrice[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [focusedRow, setFocusedRow] = useState<string | null>(null);

    // Virtualization State
    const [scrollTop, setScrollTop] = useState(0);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const ROW_HEIGHT = 40;
    const VIEWPORT_HEIGHT = 400; // Fixed height for scrollable area
    const OVERSCAN = 10;

    const virtualizedPrices = useMemo(() => {
        const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
        const endIndex = Math.min(localPrices.length, Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ROW_HEIGHT) + OVERSCAN);

        return localPrices.slice(startIndex, endIndex).map((p, i) => ({
            ...p,
            top: (startIndex + i) * ROW_HEIGHT
        }));
    }, [localPrices, scrollTop]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        setScrollTop(e.currentTarget.scrollTop);
    };

    // Reset scroll when range changes
    useEffect(() => {
        setScrollTop(0);
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = 0;
        }
    }, [range]);

    // Initialize local state when prices are fetched
    useEffect(() => {
        if (prices && prices.length > 0) {
            setLocalPrices(prices.map((p, idx) => ({
                ...p,
                id: `${p.date}-${p.source}-${idx}`,
                originalDate: p.date,
                originalSource: p.source,
                originalPrice: p.price
            })));
        } else {
            setLocalPrices([]);
        }
    }, [prices]);

    const hasChanges = useMemo(() => {
        return localPrices.some(p => p.isDeleted || p.isModified);
    }, [localPrices]);

    const handleDelete = (id: string) => {
        setLocalPrices(prev => prev.map(p =>
            p.id === id ? { ...p, isDeleted: !p.isDeleted } : p
        ));
    };

    const handleUpdate = (id: string, field: keyof AssetPrice, value: any) => {
        setLocalPrices(prev => prev.map(p => {
            if (p.id === id) {
                const updated = { ...p, [field]: value };
                // Check if actually modified compared to original
                // We compare rounded values for prices to avoid precision issues
                let isModified = false;
                if (field === 'price') {
                    isModified = parseFloat(updated.price.toFixed(2)) !== parseFloat(p.originalPrice.toFixed(2));
                } else {
                    isModified = updated.date !== p.originalDate ||
                        updated.source !== p.originalSource ||
                        updated.price !== p.originalPrice;
                }
                return { ...updated, isModified };
            }
            return p;
        }));
    };

    const handleSave = async () => {
        setSaveError(null);
        setIsSaving(true);

        const updates = localPrices
            .filter(p => p.isModified && !p.isDeleted)
            .map(p => ({
                old_date: p.originalDate,
                old_source: p.originalSource,
                new_date: p.date,
                new_source: p.source,
                new_price: p.price
            }));

        const deletions = localPrices
            .filter(p => p.isDeleted)
            .map(p => ({
                date: p.originalDate,
                source: p.originalSource
            }));

        const result = await syncPrices(isin, updates, deletions);

        setIsSaving(false);
        if (result.success) {
            invalidateCache(portfolioId);
            window.location.reload();
        } else {
            setSaveError(result.error || "Errore durante il salvataggio");
        }
    };

    return (
        <Dialog open={open} onOpenChange={(val) => {
            if (!val && hasChanges && !isSaving) {
                if (confirm("Hai modifiche non salvate. Chiudere comunque?")) {
                    onOpenChange(false);
                }
            } else {
                onOpenChange(val);
            }
        }}>
            <DialogContent
                className="sm:max-w-xl max-h-[90vh] flex flex-col bg-[#0A0A0A] border-white/40 text-gray-200 shadow-2xl p-0"
                showCloseButton={true}
            >
                <DialogHeader className="shrink-0 px-6 pt-6 pb-3">
                    <div className="flex justify-between items-start">
                        <div>
                            <DialogTitle className="text-lg font-bold">
                                Prezzi — {assetName}
                            </DialogTitle>
                            <DialogDescription className="text-sm text-muted-foreground">
                                Gestisci i punti prezzo manuali. I prezzi da transazione sono in sola lettura.
                            </DialogDescription>
                        </div>
                        <div className="flex items-center gap-3 mr-8">
                            <div className="flex bg-white/5 border border-white/10 rounded-lg p-0.5">
                                {[
                                    { label: "1A", value: 365 },
                                    { label: "2A", value: 730 },
                                    { label: "Tutto", value: null }
                                ].map((opt) => (
                                    <button
                                        key={opt.label}
                                        onClick={() => setRange(opt.value)}
                                        className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${range === opt.value
                                            ? "bg-primary text-primary-foreground shadow-lg"
                                            : "text-muted-foreground hover:text-white"
                                            }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                            {hasChanges && (
                                <Button
                                    size="sm"
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="bg-primary hover:bg-primary/80 text-primary-foreground"
                                >
                                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                    Salva
                                </Button>
                            )}
                        </div>
                    </div>
                    {saveError && (
                        <div className="mt-2 p-2 bg-red-500/20 border border-red-500/50 text-red-400 text-xs rounded flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4" />
                            {saveError}
                        </div>
                    )}
                </DialogHeader>

                <div className="flex-1 min-h-0 flex flex-col overflow-hidden px-6 pb-6 mt-2">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <span className="ml-3 text-muted-foreground">Caricamento prezzi...</span>
                        </div>
                    ) : error ? (
                        <div className="p-4 border border-red-500/30 bg-red-500/10 text-red-400 rounded-md">
                            Errore: {error}
                        </div>
                    ) : (
                        <div className="flex flex-col flex-1 min-h-0 border border-slate-700 rounded-md overflow-hidden">
                            <div className="flex-shrink-0 bg-slate-100 flex items-center border-b border-slate-300 pr-[14px]">
                                <div className="px-3 py-2 text-black font-extrabold text-xs uppercase tracking-wider w-[150px] border-r border-slate-300">Data</div>
                                <div className="px-3 py-2 text-black font-extrabold text-xs uppercase tracking-wider flex-1 border-r border-slate-300">Fonte</div>
                                <div className="px-3 py-2 text-black font-extrabold text-xs uppercase tracking-wider w-[120px] text-right border-r border-slate-300">Prezzo (€)</div>
                                <div className="px-3 py-2 text-black font-extrabold text-xs uppercase tracking-wider w-[50px] text-center">X</div>
                            </div>

                            <div
                                className="flex-1 overflow-y-auto overflow-x-hidden bg-[#0A0A0A] relative"
                                style={{ height: VIEWPORT_HEIGHT }}
                                onScroll={handleScroll}
                                ref={scrollContainerRef}
                            >
                                <div style={{ height: localPrices.length * ROW_HEIGHT, position: 'relative' }}>
                                    {virtualizedPrices.map((p) => {
                                        const isTransaction = p.source.toLowerCase().includes('transaction');
                                        const rowStyle = p.isDeleted
                                            ? "opacity-40 bg-red-950/20 grayscale"
                                            : p.isModified
                                                ? "bg-yellow-500/5"
                                                : "";

                                        return (
                                            <div
                                                key={p.id}
                                                className={`flex items-center border-b border-slate-700 hover:bg-white/5 transition-colors group ${rowStyle}`}
                                                style={{
                                                    position: 'absolute',
                                                    top: p.top,
                                                    left: 0,
                                                    right: 0,
                                                    height: ROW_HEIGHT
                                                }}
                                            >
                                                {/* Date Cell */}
                                                <div className="px-3 py-2 w-[150px] border-r border-slate-700 h-10 flex items-center">
                                                    <span className="text-sm font-mono text-slate-300 truncate w-full">
                                                        {p.date}
                                                    </span>
                                                </div>

                                                {/* Source Cell */}
                                                <div className="px-3 py-2 flex-1 border-r border-slate-700 h-10 flex items-center overflow-hidden">
                                                    <span
                                                        className={`text-sm truncate w-full ${isTransaction ? 'text-[10px] text-muted-foreground italic' : 'text-slate-300'}`}
                                                        title={p.source}
                                                    >
                                                        {p.source}
                                                    </span>
                                                </div>

                                                {/* Price Cell */}
                                                <div className="px-2 py-1 w-[120px] border-r border-slate-700 h-10 flex justify-end">
                                                    <input
                                                        type={focusedRow === p.id ? "number" : "text"}
                                                        step="any"
                                                        value={focusedRow === p.id ? (p.price === 0 && !p.isModified ? '0' : p.price) : p.price.toFixed(2)}
                                                        disabled={isTransaction || p.isDeleted}
                                                        onChange={(e) => handleUpdate(p.id, 'price', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                                                        onFocus={() => {
                                                            if (!isTransaction && !p.isDeleted) {
                                                                setFocusedRow(p.id);
                                                            }
                                                        }}
                                                        onBlur={() => setFocusedRow(null)}
                                                        className={`w-full bg-transparent border-none text-sm font-mono text-right focus:ring-1 focus:ring-primary rounded px-1 outline-none font-bold disabled:opacity-70 ${p.isDeleted ? 'text-slate-500' : p.isModified ? 'text-red-500' : 'text-primary'
                                                            }`}
                                                    />
                                                </div>

                                                {/* Actions Cell */}
                                                <div className="w-[50px] h-10 flex items-center justify-center">
                                                    {!isTransaction && (
                                                        <button
                                                            onClick={() => handleDelete(p.id)}
                                                            className={`p-1 rounded-full transition-colors ${p.isDeleted ? 'text-green-500 hover:bg-green-500/10' : 'text-red-500 hover:bg-red-500/10'}`}
                                                            title={p.isDeleted ? "Ripristina" : "Elimina"}
                                                        >
                                                            {p.isDeleted ? <X className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                {localPrices.length === 0 && !isLoading && (
                                    <div className="absolute top-0 left-0 w-full py-12 text-center text-muted-foreground italic">
                                        Nessun prezzo registrato per questo intervallo temporale.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
