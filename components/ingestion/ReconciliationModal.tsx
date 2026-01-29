'use client';

import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, Info, ArrowRight, Wallet } from 'lucide-react';

interface DeltaItem {
  isin: string;
  type: string;
  quantity_change: number;
  current_db_qty: number;
  new_total_qty: number;
  excel_operation_declared?: string;
  excel_price?: number;
  excel_date?: string;
  asset_type_proposal?: string;
  excel_description?: string;
  details?: string;
  resolved?: boolean;
}

interface DividendItem {
  isin: string;
  amount: number;
  date: string;
}

interface ReconciliationModalProps {
  isOpen: boolean;
  onClose: () => void;
  delta: DeltaItem[];
  dividends?: DividendItem[]; // New Prop
  prices: any[];
  onConfirm: (resolutions: any[]) => void;
}

export const ReconciliationModal: React.FC<ReconciliationModalProps> = ({ isOpen, onClose, delta, dividends = [], prices, onConfirm }) => {
  const [resolutions, setResolutions] = useState<Record<string, { date: string, price: number }>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ... (Resolution Logic remains the same)
  const handleResolutionChange = (isin: string, field: 'date' | 'price', value: string | number) => {
    setResolutions(prev => ({
      ...prev,
      [isin]: {
        ...prev[isin],
        [field]: value
      }
    }));
  };

  const sortedItems = useMemo(() => {
    return [...delta].sort((a, b) => {
      // Priority: Errors > Missing > Sells > Buys
      if (a.type === 'INCONSISTENT_NEW_ISIN') return -1;
      if (b.type === 'INCONSISTENT_NEW_ISIN') return 1;
      if (a.type === 'MISSING_FROM_UPLOAD') return -1;
      if (b.type === 'MISSING_FROM_UPLOAD') return 1;
      if (a.type === 'Vendita') return -1;
      if (b.type === 'Vendita') return 1;
      return 0;
    });
  }, [delta]);

  const handleSubmit = async () => {
    const finalData = delta.map(item => {
      if (item.type === 'MISSING_FROM_UPLOAD') {
        const res = resolutions[item.isin];
        if (!res || !res.date || !res.price) return null;
        return { ...item, ...res, resolved: true };
      }
      return item;
    }).filter(Boolean);

    setIsSubmitting(true);
    document.body.style.cursor = 'wait';
    try {
      await onConfirm(finalData);
    } catch (e) {
      console.error("Submission failed", e);
    } finally {
      setIsSubmitting(false);
      document.body.style.cursor = 'default';
    }
  };

  const hasPrices = prices && prices.length > 0;
  const hasDividends = dividends && dividends.length > 0;
  const hasDelta = delta && delta.length > 0;

  const missingCount = delta.filter(d => d.type === 'MISSING_FROM_UPLOAD').length;
  const resolvedMissingCount = Object.keys(resolutions).filter(k => resolutions[k].date && resolutions[k].price).length;
  const canSubmit = (missingCount === 0 || resolvedMissingCount === missingCount);

  const getBadges = (item: DeltaItem) => {
    switch (item.type) {
      case 'Acquisto': return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Acquisto</Badge>;
      case 'Vendita': return <Badge variant="destructive" className="bg-red-500/20 text-red-400 border-red-500/30">Vendita</Badge>;
      case 'METADATA_UPDATE': return <Badge variant="secondary" className="bg-blue-500/15 text-blue-400 border-blue-500/30">Aggiornamento</Badge>;
      case 'MISSING_FROM_UPLOAD': return <Badge variant="outline" className="bg-orange-500/10 text-orange-400 border-orange-500/30">Non in file</Badge>;
      case 'INCONSISTENT_NEW_ISIN': return <Badge variant="destructive">Errore</Badge>;
      default: return <Badge variant="outline">{item.type}</Badge>;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      {/* Expanded Width to max-w-7xl, lighter styling */}
      <DialogContent className="w-[98vw] max-w-full h-[90vh] flex flex-col p-0 gap-0 bg-[#0A0A0A] border-white/10 text-gray-200">
        <DialogHeader className="p-6 pb-4 border-b border-white/10 shrink-0">
          <DialogTitle className="text-xl font-medium text-white flex items-center gap-2">
            Riconciliazione Portafoglio
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            {hasDividends
              ? `Rilevate ${dividends.length} cedole da importare. Conferma per procedere.`
              : "Verifica le modifiche rilevate prima di sincronizzare."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 scroll-smooth space-y-8">

          {/* DIVIDENDS TABLE */}
          {hasDividends && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-indigo-400">
                <Wallet className="w-5 h-5" />
                <h3 className="font-semibold">Cedole e Dividendi Rilevati</h3>
              </div>
              <div className="rounded-md border border-white/10 bg-white/5 overflow-hidden">
                <Table>
                  <TableHeader className="bg-white/5 border-b border-white/10">
                    <TableRow className="hover:bg-transparent border-white/10">
                      <TableHead className="text-gray-400">ISIN</TableHead>
                      <TableHead className="text-gray-400 text-right">Data</TableHead>
                      <TableHead className="text-gray-400 text-right">Importo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dividends.map((div, idx) => (
                      <TableRow key={idx} className="border-white/5 hover:bg-white/5">
                        <TableCell className="font-mono text-gray-300">{div.isin}</TableCell>
                        <TableCell className="text-right text-gray-300">{div.date}</TableCell>
                        <TableCell className="text-right font-medium text-emerald-400">
                          {div.amount > 0 ? '+' : ''}{div.amount.toFixed(2)} €
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* DELTA TABLE */}
          {hasDelta && (
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-200">Variazioni Portafoglio</h3>
              <div className="rounded-md border border-white/10 bg-white/5 overflow-hidden">
                <Table>
                  <TableHeader className="bg-white/5 border-b border-white/10">
                    <TableRow className="hover:bg-transparent border-white/10">
                      <TableHead className="min-w-[200px] text-gray-400">Asset / Descrizione</TableHead>
                      <TableHead className="w-[100px] text-gray-400">Azione</TableHead>
                      <TableHead className="text-right text-gray-400">Quantità</TableHead>
                      <TableHead className="text-right text-gray-400">Dettagli</TableHead>
                      {missingCount > 0 && <TableHead className="w-[260px] text-right text-gray-400">Risoluzione</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedItems.map((item, idx) => {
                      const isMissing = item.type === 'MISSING_FROM_UPLOAD';

                      return (
                        <TableRow key={idx} className={`border-white/5 hover:bg-white/5 ${isMissing ? 'bg-orange-500/5' : ''}`}>
                          <TableCell>
                            <div>
                              <div className="text-sm font-medium text-gray-200">{item.excel_description || item.isin}</div>
                              <div className="text-xs text-gray-500 font-mono mt-0.5">{item.isin}</div>
                            </div>
                          </TableCell>
                          <TableCell>{getBadges(item)}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-gray-300">
                            {item.quantity_change !== 0 ? (
                              <div className="flex items-center justify-end gap-2">
                                <span className="text-gray-500">{item.current_db_qty}</span>
                                <ArrowRight className="w-3 h-3 text-gray-600" />
                                <span className="font-bold text-gray-200">{item.new_total_qty}</span>
                              </div>
                            ) : <span className="text-gray-600">-</span>}
                          </TableCell>
                          <TableCell className="text-right">
                            {isMissing ? (
                              <span className="text-xs text-orange-400">Dati vendita richiesti</span>
                            ) : (
                              <div className="flex flex-col items-end text-sm text-gray-300">
                                {item.excel_price && <span>{item.excel_price.toFixed(2)} €</span>}
                                {item.excel_date && <span className="text-xs text-gray-500">{item.excel_date}</span>}
                              </div>
                            )}
                          </TableCell>
                          {missingCount > 0 && (
                            <TableCell className="text-right">
                              {isMissing ? (
                                <div className="flex gap-2 justify-end">
                                  <Input type="date" className="h-8 w-auto min-w-[120px] text-xs bg-black/40 border-white/20 text-gray-200" onChange={(e) => handleResolutionChange(item.isin, 'date', e.target.value)} />
                                  <Input type="number" placeholder="€" className="h-8 w-20 text-xs bg-black/40 border-white/20 text-gray-200" onChange={(e) => handleResolutionChange(item.isin, 'price', parseFloat(e.target.value))} />
                                </div>
                              ) : null}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* PRICE UPDATES (Compact) */}
          {hasPrices && (
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="flex items-center gap-2 mb-3">
                <Info className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-semibold text-gray-300">Aggiornamenti Prezzi ({prices.length})</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {prices.slice(0, 12).map((p, i) => (
                  <div key={i} className="text-xs px-2 py-1 rounded bg-black/40 border border-white/10 text-gray-400 font-mono">
                    {p.isin}: <span className="text-gray-200">{p.price?.toFixed(2)}€</span>
                  </div>
                ))}
                {prices.length > 12 && <div className="text-xs px-2 py-1 text-gray-500">+{prices.length - 12} altri</div>}
              </div>
            </div>
          )}

          {!hasDividends && !hasDelta && !hasPrices && (
            <div className="text-center py-12 text-gray-500">
              Nessuna modifica rilevata.
            </div>
          )}

        </div>

        <DialogFooter className="p-6 pt-4 border-t border-white/10 bg-white/5 shrink-0">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting} className="border-white/10 text-gray-300 hover:bg-white/10 hover:text-white">Annulla</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || isSubmitting} className="bg-indigo-600 hover:bg-indigo-500 text-white border-0">
            {isSubmitting ? 'Sincronizzazione...' : hasDividends ? 'Conferma Importazione' : 'Conferma e Sincronizza'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
