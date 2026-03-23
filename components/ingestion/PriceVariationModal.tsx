
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface PriceVariation {
    name: string;
    isin: string;
    old_price?: number;
    old_price_date?: string;
    new_price?: number;
    variation_pct?: number;
    days_delta?: number;
    price_count?: number;
    is_hidden?: boolean;
}

interface PriceVariationModalProps {
    isOpen: boolean;
    onClose: () => void;
    variations: PriceVariation[];
    totalUpdated: number;
    threshold?: number;
    isHistoricalReconstruction?: boolean;
    uniqueAssetsCount?: number;
    hasUpdates?: boolean;
    onConfirm: () => void;
}

export const PriceVariationModal: React.FC<PriceVariationModalProps> = ({
    isOpen,
    onClose,
    variations,
    totalUpdated,
    threshold,
    isHistoricalReconstruction,
    uniqueAssetsCount,
    hasUpdates,
    onConfirm
}) => {

    // Format percentage with sign
    const formatPct = (val: number) => {
        const sign = val >= 0 ? '+' : '';
        return `${sign}${val.toFixed(2)}%`;
    };

    // Determine color based on threshold
    const getColor = (val: number) => {
        const absVal = Math.abs(val);
        const currentThreshold = threshold || 0.1;

        if (absVal < currentThreshold) return 'text-gray-500 opacity-60';
        if (val > 0) return 'text-green-500';
        if (val < 0) return 'text-red-500';
        return 'text-gray-400';
    };

    // List only significant variations in the table for noise reduction
    const absThreshold = threshold || 0.1;
    const visibleVariations = variations.filter(v => Math.abs(v.variation_pct || 0) >= absThreshold);
    const significantCount = visibleVariations.length;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-2xl bg-[#0a0a0a] border-white/20 text-foreground shadow-2xl">
                <DialogHeader>
                    <DialogTitle>
                        {isHistoricalReconstruction
                            ? "Ricostruzione Storico Prezzi"
                            : "Aggiornamento Prezzi"}
                    </DialogTitle>
                </DialogHeader>

                {hasUpdates && !isHistoricalReconstruction && (
                    <div className="bg-yellow-500/10 border-l-4 border-yellow-500 p-3 mb-4 mx-6 rounded text-yellow-500 text-sm">
                        ⚠️ <strong>Aggiornamento Prezzi</strong> - alcuni prezzi importati sono già presenti per queste date. Le variazioni (Var.) mostrano la differenza tra il valore precedentemente registrato a DB e il nuovo valore caricato.
                    </div>
                )}

                <div className="max-h-[60vh] overflow-y-auto border border-white/40 rounded-md">
                    {isHistoricalReconstruction ? (
                        // Historical Reconstruction Mode: Simple asset list
                        <Table>
                            <TableHeader>
                                <TableRow className="border-b-2 border-white/40 bg-white/10 hover:bg-white/10">
                                    <TableHead className="border-r border-white/20">Asset</TableHead>
                                    <TableHead className="border-r border-white/20">ISIN</TableHead>
                                    <TableHead className="border-r border-white/20">Data</TableHead>
                                    <TableHead className="text-right">Prezzi nel File</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {variations.map((item, idx) => (
                                    <TableRow key={idx} className="border-b-2 border-white/20 hover:bg-white/10">
                                        <TableCell className="font-medium border-r border-white/20">{item.name}</TableCell>
                                        <TableCell className="text-muted-foreground text-xs border-r border-white/20">{item.isin}</TableCell>
                                        <TableCell className="text-muted-foreground text-xs border-r border-white/20">-</TableCell>
                                        <TableCell className="text-right text-blue-400">
                                            {item.price_count || 1} date
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        // Normal Mode: Price variations table
                        <Table>
                            <TableHeader>
                                <TableRow className="border-b-2 border-white/40 bg-white/10 hover:bg-white/10">
                                    <TableHead className="border-r border-white/20">Asset</TableHead>
                                    <TableHead className="border-r border-white/20">ISIN</TableHead>
                                    <TableHead className="border-r border-white/20">Data</TableHead>
                                    <TableHead className="text-right border-r border-white/20">Old Price</TableHead>
                                    <TableHead className="text-right border-r border-white/20">New Price</TableHead>
                                    <TableHead className="text-right">Var.</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {visibleVariations.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                            Nessuna variazione significativa ({'>'}{absThreshold}%) rilevata.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    visibleVariations.map((item, idx) => (
                                        <TableRow key={idx} className="border-b-2 border-white/20 hover:bg-white/10">
                                            <TableCell className="font-medium border-r border-white/20">{item.name}</TableCell>
                                            <TableCell className="text-muted-foreground text-xs border-r border-white/20">{item.isin}</TableCell>
                                            <TableCell className="text-muted-foreground text-xs border-r border-white/20">{item.old_price_date || '-'}</TableCell>
                                            <TableCell className="text-right border-r border-white/20">{(item.old_price || 0).toFixed(2)} €</TableCell>
                                            <TableCell className="text-right border-r border-white/20">{(item.new_price || 0).toFixed(2)} €</TableCell>
                                            <TableCell className={`text-right font-bold ${getColor(item.variation_pct || 0)}`}>
                                                {formatPct(item.variation_pct || 0)}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    )}
                </div>

                <DialogFooter className="mt-4">
                    <div className="flex justify-between w-full items-center">
                        <span className="text-sm text-muted-foreground">
                            {isHistoricalReconstruction
                                ? `${totalUpdated} prezzi storici caricati per ${uniqueAssetsCount || variations.length} asset`
                                : `${totalUpdated} prezzi di asset caricati (${significantCount} asset con Δ>|${absThreshold}%|)`
                            }
                        </span>
                        <div className="flex gap-2">
                            <Button onClick={onClose} variant="secondary">Annulla</Button>
                            <Button onClick={onConfirm}>Conferma Aggiornamento</Button>
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
