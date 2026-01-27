'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface DeltaItem {
  isin: string;
  type: string;
  quantity_change: number;
  current_db_qty: number;
  new_total_qty: number;
  excel_operation_declared?: string;
  excel_price?: number;
  excel_date?: string;
  details?: string;
  resolved?: boolean;
}

interface ReconciliationModalProps {
  isOpen: boolean;
  onClose: () => void;
  delta: DeltaItem[];
  prices: any[];
  onConfirm: (resolutions: any[]) => void;
}

export const ReconciliationModal: React.FC<ReconciliationModalProps> = ({ isOpen, onClose, delta, prices, onConfirm }) => {
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

  const handleSubmit = async () => {
    const finalData = delta.map(item => {
      if (item.type === 'MISSING_FROM_UPLOAD') {
        const res = resolutions[item.isin];
        if (!res || !res.date || !res.price) {
          return null;
        }
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

  const missingItems = delta.filter(d => d.type === 'MISSING_FROM_UPLOAD');
  const inconsistentItems = delta.filter(d => d.type === 'INCONSISTENT_NEW_ISIN');
  const validItems = delta.filter(d => d.type !== 'MISSING_FROM_UPLOAD' && d.type !== 'INCONSISTENT_NEW_ISIN');

  const hasPrices = prices && prices.length > 0;
  const canSubmit = validItems.length > 0 || missingItems.length > 0 || hasPrices;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-[95vw] h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Report di Riconciliazione</DialogTitle>
          <DialogDescription>
            Rivedi le modifiche rilevate dal file Excel.
          </DialogDescription>
        </DialogHeader>

        {/* PRICE UPDATES */}
        {hasPrices && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-2">Aggiornamenti Prezzi ({prices.length})</h3>
            <div className="max-h-[200px] overflow-y-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ISIN</TableHead>
                    <TableHead>Nuovo Prezzo (EUR)</TableHead>
                    <TableHead>Data Rilevata</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prices.map((p, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{p.isin}</TableCell>
                      <TableCell>{p.price}</TableCell>
                      <TableCell>{p.date || 'Oggi'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* VALID UPDATES (Buy/Sell from Excel) */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-2">Aggiornamenti Portafoglio</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ISIN</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Delta Qta</TableHead>
                <TableHead>Prezzo (EUR)</TableHead>
                <TableHead>Nuovo Totale</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {validItems.map((item, idx) => (
                <TableRow key={idx}>
                  <TableCell>{item.isin}</TableCell>
                  <TableCell className={item.type === 'Acquisto' ? 'text-green-600' : 'text-red-600'}>
                    {item.type}
                  </TableCell>
                  <TableCell>{item.quantity_change}</TableCell>
                  <TableCell>{item.excel_price ? item.excel_price.toFixed(2) : '-'}</TableCell>
                  <TableCell>{item.new_total_qty}</TableCell>
                </TableRow>
              ))}
              {validItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-gray-500">Nessun aggiornamento di quantità rilevato.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* MISSING ISINs (Potential Sales) */}
        {missingItems.length > 0 && (
          <div className="mb-6 border-l-4 border-red-500 pl-4 bg-red-50 p-4 rounded">
            <h3 className="text-lg font-bold text-red-700 mb-2">Possibili Vendite Rilevate</h3>
            <p className="text-sm text-red-600 mb-4">
              I seguenti asset esistono nel DB ma mancano nel file.
              Confermi la vendita totale?
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ISIN</TableHead>
                  <TableHead>Qta Venduta</TableHead>
                  <TableHead>Data Vendita</TableHead>
                  <TableHead>Prezzo Totale (EUR)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {missingItems.map(item => (
                  <TableRow key={item.isin}>
                    <TableCell>{item.isin}</TableCell>
                    <TableCell>{item.current_db_qty}</TableCell>
                    <TableCell>
                      <Input
                        type="date"
                        onChange={(e) => handleResolutionChange(item.isin, 'date', e.target.value)}
                        required
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        placeholder="Totale EUR"
                        onChange={(e) => handleResolutionChange(item.isin, 'price', parseFloat(e.target.value))}
                        required
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* INCONSISTENCY ALERT (Moved to bottom) */}
        {inconsistentItems.length > 0 && (
          <div className="mb-6 p-4 bg-yellow-50 border-l-4 border-yellow-500 rounded">
            <h3 className="text-lg font-bold text-yellow-700 mb-2">⚠️ Nuovi Asset Incompleti</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[150px]">ISIN</TableHead>
                  <TableHead>Qta Rilevata</TableHead>
                  <TableHead>Problema</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inconsistentItems.map(item => (
                  <TableRow key={item.isin}>
                    <TableCell className="font-medium">{item.isin}</TableCell>
                    <TableCell>{item.new_total_qty}</TableCell>
                    <TableCell className="text-red-500 font-semibold">{item.details}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Annulla</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || isSubmitting}>
            {isSubmitting ? 'Sincronizzazione...' : 'Conferma e Sincronizza'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
