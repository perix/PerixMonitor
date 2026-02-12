'use client';

import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, Info, ArrowRight, Wallet, TrendingDown } from 'lucide-react';

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
  name?: string;
  date: string;
  amount?: number;
  type?: string; // 'DIVIDEND' | 'EXPENSE'
  current_amount?: number;
  new_amount?: number;
  total_amount?: number;
  operation?: string;
  // Full DB totals for this asset
  db_dividends_total?: number;
  db_expenses_total?: number;
  db_div_count?: number;
  db_exp_count?: number;
}

interface ReconciliationModalProps {
  isOpen: boolean;
  onClose: () => void;
  delta: DeltaItem[];
  dividends?: DividendItem[];
  prices: any[];
  onConfirm: (resolutions: any[]) => void;
}

export const ReconciliationModal: React.FC<ReconciliationModalProps> = ({ isOpen, onClose, delta, dividends = [], prices, onConfirm }) => {
  const [resolutions, setResolutions] = useState<Record<string, { date: string, price: number }>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

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
  const errorCount = delta.filter(d => d.type.startsWith('ERROR') || d.type === 'INCONSISTENT_NEW_ISIN').length;
  const canSubmit = errorCount === 0 && (missingCount === 0 || resolvedMissingCount === missingCount);

  // ==========================================
  // DIVIDEND/EXPENSE SUMMARY COMPUTATION
  // ==========================================
  const { dividendRows, expenseRows, flowType, headerTitle } = useMemo(() => {
    if (!hasDividends) return { dividendRows: [], expenseRows: [], flowType: 'mixed' as const, headerTitle: '' };

    // Separate by type
    const divEntries = dividends.filter(d => (d.type || 'DIVIDEND') === 'DIVIDEND');
    const expEntries = dividends.filter(d => d.type === 'EXPENSE');

    // Build per-asset summaries for dividends
    const buildSummary = (entries: DividendItem[]) => {
      const assetMap: Record<string, {
        isin: string; name: string; entries: number;
        total_current: number; total_new: number; total_final: number;
        has_existing: boolean;
        // Full DB totals
        db_total_all: number; db_count_all: number;
      }> = {};

      for (const div of entries) {
        const key = div.isin;
        const current = div.current_amount || 0;
        const incoming = div.new_amount !== undefined ? div.new_amount : (div.amount || 0);
        const total = div.total_amount !== undefined ? div.total_amount : (current + incoming);

        if (!assetMap[key]) {
          // Use appropriate DB totals based on entry type
          const isExpense = div.type === 'EXPENSE';
          assetMap[key] = {
            isin: div.isin,
            name: div.name || div.isin,
            entries: 0,
            total_current: 0,
            total_new: 0,
            total_final: 0,
            has_existing: false,
            db_total_all: isExpense ? (div.db_expenses_total || 0) : (div.db_dividends_total || 0),
            db_count_all: isExpense ? (div.db_exp_count || 0) : (div.db_div_count || 0),
          };
        }

        assetMap[key].entries += 1;
        assetMap[key].total_current += current;
        assetMap[key].total_new += incoming;
        assetMap[key].total_final += total;
        if (current !== 0) assetMap[key].has_existing = true;
      }

      return Object.values(assetMap);
    };

    const divRows = buildSummary(divEntries);
    const expRows = buildSummary(expEntries);

    // Determine flow type for adaptive wording
    let ft: 'dividends' | 'expenses' | 'mixed' = 'mixed';
    if (divEntries.length > 0 && expEntries.length === 0) ft = 'dividends';
    else if (expEntries.length > 0 && divEntries.length === 0) ft = 'expenses';

    let title = 'Riepilogo Flussi di Cassa';
    if (ft === 'dividends') title = 'Riepilogo Cedole e Dividendi';
    else if (ft === 'expenses') title = 'Riepilogo Spese e Costi';

    return { dividendRows: divRows, expenseRows: expRows, flowType: ft, headerTitle: title };
  }, [dividends, hasDividends]);

  // Count totals for description
  const totalFileEntries = dividends.length;
  const totalAssets = new Set(dividends.map(d => d.isin)).size;

  const getBadges = (item: DeltaItem) => {
    switch (item.type) {
      case 'Acquisto': return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Acquisto</Badge>;
      case 'Vendita': return <Badge variant="destructive" className="bg-red-500/20 text-red-400 border-red-500/30">Vendita</Badge>;
      case 'METADATA_UPDATE': return <Badge variant="secondary" className="bg-blue-500/15 text-blue-400 border-blue-500/30">Aggiornamento</Badge>;
      case 'MISSING_FROM_UPLOAD': return <Badge variant="outline" className="bg-orange-500/10 text-orange-400 border-orange-500/30">Non in file</Badge>;
      case 'INCONSISTENT_NEW_ISIN': return <Badge variant="destructive">Errore Dati</Badge>;
      case 'ERROR_QTY_MISMATCH_NO_OP': return <Badge variant="destructive">Discrepanza Qta</Badge>;
      case 'ERROR_NEGATIVE_QTY': return <Badge variant="destructive">Saldo Negativo</Badge>;
      case 'ERROR_INCOMPLETE_OP': return <Badge variant="destructive">Dati Op. Mancanti</Badge>;
      default: return <Badge variant="outline">{item.type}</Badge>;
    }
  };

  // Renders a summary table section for dividends or expenses
  const renderFlowTable = (
    rows: typeof dividendRows,
    isExpense: boolean
  ) => {
    if (rows.length === 0) return null;

    const icon = isExpense
      ? <TrendingDown className="w-5 h-5" />
      : <Wallet className="w-5 h-5" />;
    const sectionColor = isExpense ? 'text-orange-400' : 'text-indigo-400';
    const sectionTitle = isExpense ? 'Spese e Costi' : 'Cedole e Dividendi';
    const labelDb = isExpense ? 'Spese in Archivio' : 'Cedole in Archivio';
    const labelNew = isExpense ? 'Nuovi Costi' : 'Nuovi Incassi';
    const labelFinal = 'Dopo Importazione';
    const entryLabel = isExpense ? 'spese' : 'cedole';

    return (
      <div className="space-y-3">
        <div className={`flex items-center gap-2 ${sectionColor}`}>
          {icon}
          <h3 className="font-semibold">{sectionTitle}</h3>
        </div>
        <div className="rounded-md border border-white/20 bg-white/5 overflow-hidden">
          <Table className="w-full">
            <TableHeader className="bg-white/5 border-b border-white/20">
              <TableRow className="hover:bg-transparent border-white/20">
                <TableHead className="text-gray-400 whitespace-nowrap">Asset</TableHead>
                <TableHead className="text-gray-400 text-center whitespace-nowrap">{labelDb}</TableHead>
                <TableHead className="text-gray-400 text-center whitespace-nowrap">{labelNew}</TableHead>
                <TableHead className="text-gray-400 text-right whitespace-nowrap font-bold">{labelFinal}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, idx) => {
                // "Dopo Importazione" = existing DB total + new from file
                const afterImport = row.db_total_all + row.total_new;

                return (
                  <TableRow key={idx} className="border-white/10 hover:bg-white/5">
                    <TableCell className="text-gray-300">
                      <div className="font-medium">{row.name}</div>
                      <div className="text-xs text-gray-500 font-mono">{row.isin}</div>
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground whitespace-nowrap">
                      <div className="font-medium">
                        {row.db_total_all !== 0 ? `${row.db_total_all.toFixed(2)} €` : '-'}
                      </div>
                      {row.db_count_all > 0 && (
                        <div className="text-xs text-gray-600">
                          ({row.db_count_all} {entryLabel})
                        </div>
                      )}
                    </TableCell>
                    <TableCell className={`text-center font-medium whitespace-nowrap ${isExpense ? 'text-orange-400' : 'text-blue-400'}`}>
                      <div>
                        {row.total_new > 0 ? '+' : ''}{row.total_new.toFixed(2)} €
                      </div>
                      <div className="text-xs text-gray-600">
                        ({row.entries} {entryLabel}{row.has_existing ? ', di cui alcune su date già presenti' : ''})
                      </div>
                    </TableCell>
                    <TableCell className={`text-right font-bold whitespace-nowrap ${afterImport >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {afterImport.toFixed(2)} €
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {rows.some(r => r.has_existing) && (
          <p className="text-xs text-amber-400/70 flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            {isExpense
              ? 'Alcune spese verranno sommate a costi già registrati nelle stesse date.'
              : 'Alcuni importi verranno sommati a cedole già presenti nelle stesse date.'}
          </p>
        )}
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-auto max-w-[98vw] sm:max-w-[98vw] h-[90vh] flex flex-col p-0 gap-0 bg-[#0A0A0A] border-white/40 text-gray-200">
        <DialogHeader className="p-6 pb-4 border-b border-white/20 shrink-0">
          <DialogTitle className="text-xl font-medium text-white flex items-center gap-2">
            Riconciliazione Portafoglio
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            {hasDividends
              ? `Rilevati ${totalFileEntries} flussi per ${totalAssets} asset. Verifica il riepilogo e conferma.`
              : "Verifica le modifiche rilevate prima di sincronizzare."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto overflow-x-auto p-6 scroll-smooth space-y-8">

          {/* === DIVIDEND/EXPENSE SECTIONS === */}
          {hasDividends && (
            <div className="space-y-6">
              {/* Section header */}
              {flowType === 'mixed' && (
                <h2 className="text-lg font-semibold text-white">{headerTitle}</h2>
              )}

              {/* Dividends table */}
              {renderFlowTable(dividendRows, false)}

              {/* Expenses table */}
              {renderFlowTable(expenseRows, true)}
            </div>
          )}

          {/* DELTA TABLE */}
          {hasDelta && (
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-200">Variazioni Portafoglio</h3>
              <div className="rounded-md border border-white/20 bg-white/5 overflow-hidden">
                <Table className="w-full">
                  <TableHeader className="bg-white/5 border-b border-white/20">
                    <TableRow className="hover:bg-transparent border-white/20">
                      <TableHead className="text-gray-400 font-bold min-w-[300px]">Asset / Descrizione</TableHead>
                      <TableHead className="text-gray-400 font-bold whitespace-nowrap px-4">Azione</TableHead>
                      <TableHead className="text-right text-gray-400 font-bold whitespace-nowrap px-4">Quantità</TableHead>
                      <TableHead className="text-right text-gray-400 font-bold whitespace-nowrap px-4">Dettagli</TableHead>
                      {missingCount > 0 && <TableHead className="text-right text-gray-400 font-bold whitespace-nowrap px-4">Risoluzione</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedItems.map((item, idx) => {
                      const isMissing = item.type === 'MISSING_FROM_UPLOAD';
                      return (
                        <TableRow key={idx} className={`border-white/10 hover:bg-white/5 ${isMissing ? 'bg-orange-500/5' : ''}`}>
                          <TableCell className="truncate pr-4">
                            <div>
                              <div className="text-sm font-medium text-gray-200 truncate" title={item.excel_description || item.isin}>{item.excel_description || item.isin}</div>
                              <div className="text-xs text-gray-500 font-mono mt-0.5">{item.isin}</div>
                            </div>
                          </TableCell>
                          <TableCell>{getBadges(item)}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-gray-300 whitespace-nowrap">
                            {item.quantity_change !== 0 ? (
                              <div className="flex items-center justify-end gap-2">
                                <span className="text-gray-500">{Number(item.current_db_qty).toFixed(4).replace(/\.?0+$/, '')}</span>
                                <ArrowRight className="w-3 h-3 text-gray-600" />
                                <span className="font-bold text-gray-200">{Number(item.new_total_qty).toFixed(4).replace(/\.?0+$/, '')}</span>
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
            <div className="p-4 bg-white/5 rounded-lg border border-white/20">
              <div className="flex items-center gap-2 mb-3">
                <Info className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-semibold text-gray-300">Aggiornamenti Prezzi ({prices.length})</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {prices.slice(0, 12).map((p: any, i: number) => (
                  <div key={i} className="text-xs px-2 py-1 rounded bg-black/40 border border-white/20 text-gray-400 font-mono">
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

        <DialogFooter className="p-6 pt-4 border-t border-white/20 bg-white/5 shrink-0">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting} className="border-white/20 text-gray-300 hover:bg-white/10 hover:text-white">Annulla</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || isSubmitting} className="bg-indigo-600 hover:bg-indigo-500 text-white border-0">
            {isSubmitting ? 'Sincronizzazione...' : hasDividends ? 'Conferma Importazione' : 'Conferma e Sincronizza'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
