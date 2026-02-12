'use client';

import React, { useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ReconciliationModal } from './ReconciliationModal';
import { PriceVariationModal } from './PriceVariationModal';
import { Sparkles, Loader2 } from 'lucide-react';

import { PortfolioSelector } from '../user/PortfolioSelector';
import { usePortfolio } from '@/context/PortfolioContext';

export const UploadForm = () => {
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [delta, setDelta] = useState<any[] | null>(null);
    const [dividends, setDividends] = useState<any[] | null>(null);
    const [dividendDelta, setDividendDelta] = useState<any[] | null>(null); // [NEW] Enriched dividend data
    const [pricesAndSnapshot, setPricesAndSnapshot] = useState<{ prices: any[], snapshot: any } | null>(null);
    // [REFACTORED] Combined state for Price Modal to ensure atomic updates
    const [priceModalData, setPriceModalData] = useState<{
        variations: any[],
        totalUpdated: number,
        threshold?: number,
        isHistoricalReconstruction?: boolean,
        uniqueAssetsCount?: number
    } | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [enableAiLookup, setEnableAiLookup] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);

    // Global Context State
    const { selectedPortfolioId, setSelectedPortfolioId, invalidateCache, clearCache } = usePortfolio();

    // Clear logs on mount
    React.useEffect(() => {
        axios.post('/api/clear_logs').catch(err => console.error("Failed to clear logs on mount:", err));
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFile(e.target.files[0]);
            setError(null);
        }
    };

    const handleUpload = async () => {
        if (!file) return;
        if (!selectedPortfolioId) {
            setError("Seleziona un portafoglio prima di procedere.");
            return;
        }

        setLoading(true);
        setError(null);
        // Reset previous state
        setDelta(null);
        setDividends(null);
        setDividendDelta(null); // [NEW] Reset
        setPricesAndSnapshot(null);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('portfolio_id', selectedPortfolioId);



        document.body.style.cursor = 'wait';

        try {
            const response = await axios.post('/api/ingest', formData);
            const data = response.data;

            if (data.type === 'DIVIDENDS') {
                // Store dividends and enriched delta
                setDividends(data.parsed_data);
                setDividendDelta(data.delta || null); // [NEW] Store enriched delta from backend
                setShowModal(true);
            } else {
                // Standard Portfolio
                const { delta, prices, snapshot_proposal, price_variations, debug } = data;

                setDelta(delta);
                setPricesAndSnapshot({ prices, snapshot: snapshot_proposal });

                // Check for actionable transactions (Buy/Sell)
                const hasTransactions = delta && delta.some((d: any) =>
                    d.type !== 'METADATA_UPDATE' &&
                    d.type !== 'ERROR_QTY_MISMATCH_NO_OP' &&
                    d.type !== 'ERROR_INCOMPLETE_OP'
                );

                if (hasTransactions) {
                    setShowModal(true);
                } else if (price_variations && price_variations.length > 0) {
                    // Store both variations and total count atomically
                    setPriceModalData({
                        variations: price_variations,
                        totalUpdated: prices ? prices.length : 0,
                        threshold: data.threshold,
                        isHistoricalReconstruction: data.is_historical_reconstruction || false,
                        uniqueAssetsCount: data.unique_assets_count || 0
                    });
                } else if ((delta && delta.length > 0) || (prices && prices.length > 0)) {
                    setShowModal(true);
                } else {
                    let msg = "Nessuna modifica rilevata (né transazioni né prezzi nuovi)!";
                    if (debug?.columns_found) {
                        msg += `\n\n[DEBUG] Colonne trovate: ${debug.columns_found.join(', ')}`;
                        if (debug.asset_type_col_index === -1) msg += "\n[DEBUG] Colonna 'Tipologia' NON trovata.";
                        else msg += `\n[DEBUG] Colonna 'Tipologia' trovata all'indice ${debug.asset_type_col_index}.`;
                    }
                    alert(msg);
                }
            }

        } catch (err: any) {
            console.error(err);
            // Try to get the specific error from backend JSON response
            const serverError = err.response?.data?.error;
            const genericError = err.message || "Caricamento fallito";
            setError(serverError ? `Errore Server: ${serverError}` : genericError);
        } finally {
            setLoading(false);
            document.body.style.cursor = 'default';
        }
    };

    const handleReconciliationConfirm = async (resolutions: any[], trendUpdates?: any[]) => {
        if (!selectedPortfolioId) return;

        setIsSyncing(true);
        // Send final sync command to backend
        try {
            await axios.post('/api/sync', {
                changes: resolutions, // Delta resolutions
                // [NEW] Send aggregated totals with type for correct upsert
                dividends: dividendDelta ? dividendDelta.map(d => ({
                    isin: d.isin,
                    date: d.date,
                    amount: d.total_amount, // Send the CALCULATED TOTAL to be saved
                    type: d.type || (d.total_amount < 0 ? 'EXPENSE' : 'DIVIDEND')
                })) : (dividends || []),
                portfolio_id: selectedPortfolioId,
                prices: pricesAndSnapshot?.prices || [],
                snapshot: pricesAndSnapshot?.snapshot,
                enable_ai_lookup: enableAiLookup,
                trend_updates: trendUpdates || [] // [NEW] Pass trend updates
            });
            // Invalidate ALL caches because Assets are shared globally.
            // If we updated an Asset Name/Type, it affects other portfolios too.
            clearCache();
            alert("Sincronizzazione completata con successo!");
            setShowModal(false);
            setDividends(null);
            setDividendDelta(null); // [NEW] Reset
            setDelta(null);
        } catch (e: any) {
            console.error(e);
            alert("Errore durante la sincronizzazione: " + (e.response?.data?.error || e.message));
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="p-4 max-w-xl mx-auto space-y-6">
            <Card className="bg-card/50 border-white/40 text-foreground backdrop-blur-md">
                <CardHeader>
                    <CardTitle>Portafoglio</CardTitle>
                </CardHeader>
                <CardContent>
                    <PortfolioSelector
                        selectedPortfolioId={selectedPortfolioId}
                        onSelect={setSelectedPortfolioId}
                    />
                </CardContent>
            </Card>

            <Card className="bg-card/50 border-white/40 text-foreground backdrop-blur-md">
                <CardHeader>
                    <CardTitle>Seleziona File Excel</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Input
                        type="file"
                        accept=".xlsx"
                        onChange={handleFileChange}
                        disabled={!selectedPortfolioId}
                        className="file:text-foreground text-foreground border-white/20 bg-secondary/20"
                    />


                    {/* AI Lookup Toggle */}
                    <div className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-secondary/20 mb-2">
                        <div className="flex items-center gap-3">
                            <Sparkles className="w-5 h-5 text-violet-400" />
                            <div>
                                <Label htmlFor="ai-lookup" className="text-sm font-medium text-foreground cursor-pointer">
                                    Ricerca AI Asset
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                    Recupera automaticamente info asset via LLM per nuovi ISIN
                                </p>
                            </div>
                        </div>
                        <Switch
                            id="ai-lookup"
                            checked={enableAiLookup}
                            onCheckedChange={setEnableAiLookup}
                        />
                    </div>

                    {error && (
                        <Alert variant="destructive">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    <Button
                        onClick={handleUpload}
                        disabled={!file || loading || !selectedPortfolioId}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        {loading ? "Elaborazione..." : "Analizza File"}
                    </Button>
                </CardContent>
            </Card>



            {showModal && (
                <ReconciliationModal
                    isOpen={showModal}
                    onClose={() => setShowModal(false)}
                    delta={delta || []} // Safe fallback
                    dividends={dividendDelta || []} // [NEW] Pass enriched delta instead of raw
                    prices={pricesAndSnapshot?.prices || []}
                    onConfirm={handleReconciliationConfirm}
                />
            )}

            {priceModalData && (
                <PriceVariationModal
                    isOpen={!!priceModalData}
                    onClose={() => setPriceModalData(null)}
                    variations={priceModalData.variations}
                    totalUpdated={priceModalData.totalUpdated}
                    threshold={priceModalData.threshold}
                    isHistoricalReconstruction={priceModalData.isHistoricalReconstruction}
                    uniqueAssetsCount={priceModalData.uniqueAssetsCount}
                    onConfirm={() => {
                        handleReconciliationConfirm([], priceModalData.variations);
                        setPriceModalData(null);
                    }}
                />
            )}
            {isSyncing && (
                <div className="fixed inset-0 z-[9999] bg-black/50 cursor-wait flex items-center justify-center backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-2 text-white font-medium">
                        <Loader2 className="w-8 h-8 animate-spin" />
                        <span>Sincronizzazione in corso...</span>
                    </div>
                </div>
            )}
        </div>
    );
};
