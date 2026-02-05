
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { usePortfolio } from "@/context/PortfolioContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Save, Loader2 } from 'lucide-react';

export const AssetConfigPanel = () => {
    const { selectedPortfolioId } = usePortfolio();
    const [threshold, setThreshold] = useState<number>(0.1);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        if (selectedPortfolioId) {
            loadConfig();
        }
    }, [selectedPortfolioId]);

    const loadConfig = async () => {
        if (!selectedPortfolioId) return;
        setLoading(true);
        try {
            const res = await axios.get('/api/config/assets', {
                params: { portfolio_id: selectedPortfolioId }
            });
            if (res.data && res.data.priceVariationThreshold !== undefined) {
                setThreshold(res.data.priceVariationThreshold);
            }
        } catch (error) {
            console.error("Failed to load asset config", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!selectedPortfolioId) return;
        setSaving(true);
        setMessage(null);
        try {
            await axios.post('/api/config/assets', {
                portfolio_id: selectedPortfolioId,
                priceVariationThreshold: Number(threshold)
            });
            setMessage({ type: 'success', text: 'Configurazione salvata con successo.' });
            // Dispatch event to refresh other components (like AssetList)
            window.dispatchEvent(new CustomEvent('asset-config-changed'));
        } catch (error) {
            setMessage({ type: 'error', text: 'Errore durante il salvataggio.' });
            console.error(error);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card className="bg-card border-white/40">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    Configurazione Asset
                </CardTitle>
                <CardDescription>
                    Impostazioni per il portafoglio corrente.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">

                {!selectedPortfolioId ? (
                    <Alert className="bg-amber-500/10 text-amber-500 border-amber-500/20">
                        <AlertDescription>
                            Seleziona un portafoglio dalla dashboard per modificare queste impostazioni.
                        </AlertDescription>
                    </Alert>
                ) : (
                    <>
                        <div className="space-y-2">
                            <Label>Soglia Variazione Prezzo (%)</Label>
                            <div className="flex gap-4 items-center">
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={threshold}
                                    onChange={(e) => setThreshold(parseFloat(e.target.value))}
                                    className="max-w-[150px] bg-black/20 border-slate-600"
                                />
                                <span className="text-sm text-muted-foreground">
                                    Variazione minima per colorazione degli asset più "dinamici".
                                </span>
                            </div>
                        </div>

                        {message && (
                            <Alert variant={message.type === 'error' ? "destructive" : "default"} className={message.type === 'success' ? "bg-green-500/10 text-green-500 border-green-500/20" : ""}>
                                <AlertDescription>{message.text}</AlertDescription>
                            </Alert>
                        )}

                        <div className="flex justify-end">
                            <Button onClick={handleSave} disabled={saving || loading}>
                                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                                Salva Impostazioni
                            </Button>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
};
