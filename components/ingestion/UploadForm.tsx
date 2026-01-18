'use client';

import React, { useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ReconciliationModal } from './ReconciliationModal';

import { PortfolioSelector } from '../user/PortfolioSelector';
import { usePortfolio } from '@/context/PortfolioContext';

export const UploadForm = () => {
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [delta, setDelta] = useState<any[] | null>(null);
    const [pricesAndSnapshot, setPricesAndSnapshot] = useState<{ prices: any[], snapshot: any } | null>(null);
    const [showModal, setShowModal] = useState(false);

    // Global Context State
    const { selectedPortfolioId, setSelectedPortfolioId } = usePortfolio();

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

        const formData = new FormData();
        formData.append('file', file);
        // Only sending file for analysis, portfolio ID needed for persistence later 
        // (but actually ingestion might also need DB holdings of THAT portfolio to calculate delta)
        // Only sending file for analysis, portfolio ID needed for persistence later and for delta calc
        // formData.append('db_holdings', JSON.stringify({})); // Removed: Backend now fetches this.
        // We really should fetch DB holdings for THIS portfolio_id here.
        // For now, let's proceed, but note that Delta Calc assumes empty DB if we don't pass it.
        // Or we pass portfolio_id to ingest API and let it fetch?
        // But ingest API doesn't use Supabase client yet to fetch holdings... 

        // Let's pass portfolio_id to ingest API so IT can fetch current holdings?
        // Wait, ingest.py uses 'db_holdings' param.
        // We should fetch db_holdings in Frontend? Or let backend do it?
        // Backend is better. UploadForm shouldn't fail if we can't fetch.

        // Actually, let's keep it simple: Pass 'portfolio_id' to ingest as well, 
        // and update ingest.py to fetch holdings if present.
        formData.append('portfolio_id', selectedPortfolioId);


        try {
            const response = await axios.post('/api/ingest', formData);
            const data = response.data;

            if (data.type === 'DIVIDENDS') {
                // Special handling for dividends
                if (confirm(`${data.message}\n\nStai per importare dei flussi di cassa (Cedole/Dividendi). Confermi l'importazione?`)) {
                    // Auto-confirm for now, or use a nicer modal.
                    // The user asked for "Feedback in UI". A native confirm is "meh". 
                    // Let's use the modal but maybe adapt it? 
                    // Or just direct confirm via sync since there is no "Delta" to resolve usually in dividends (just overwrite).
                    // Let's try to just call handleReconciliationConfirm with empty delta but filled dividends.

                    // Actually let's use a simple confirm for now to speed up, or set a "dividendMode" state.
                    // The user requested: "fornisci un feedback all'utente nella UI perchè sia cosciente del fatto che sta gestendo cedole".

                    await axios.post('/api/sync', {
                        changes: [],
                        dividends: data.parsed_data,
                        portfolio_id: selectedPortfolioId
                    });
                    alert("Cedole importate con successo!");
                }
            } else {
                // Standard Portfolio
                const { delta, prices, snapshot_proposal } = data;
                setDelta(delta);
                setPricesAndSnapshot({ prices, snapshot: snapshot_proposal });

                if ((delta && delta.length > 0) || (prices && prices.length > 0)) {
                    setShowModal(true);
                } else {
                    alert("Nessuna modifica rilevata (né transazioni né prezzi nuovi)!");
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
        }
    };

    const handleReconciliationConfirm = async (resolutions: any[]) => {
        if (!selectedPortfolioId) return;

        // Send final sync command to backend
        try {
            await axios.post('/api/sync', {
                changes: resolutions,
                portfolio_id: selectedPortfolioId,
                prices: pricesAndSnapshot?.prices || [],
                snapshot: pricesAndSnapshot?.snapshot
            });
            alert("Sincronizzazione completata con successo!");
            setShowModal(false);
            // Optional: Request dashboard refresh
        } catch (e: any) {
            console.error(e);
            alert("Errore durante la sincronizzazione: " + (e.response?.data?.error || e.message));
        }
    };

    return (
        <div className="p-4 max-w-xl mx-auto space-y-6">
            <Card className="bg-card/50 border-white/10 text-foreground backdrop-blur-md">
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

            <Card className="bg-card/50 border-white/10 text-foreground backdrop-blur-md">
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



            {delta && (
                <ReconciliationModal
                    isOpen={showModal}
                    onClose={() => setShowModal(false)}
                    delta={delta}
                    prices={pricesAndSnapshot?.prices || []}
                    onConfirm={handleReconciliationConfirm}
                />
            )}
        </div>
    );
};
