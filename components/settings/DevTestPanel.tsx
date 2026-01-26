'use client';

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { usePortfolio } from '@/context/PortfolioContext';
import {
    Bug,
    Play,
    Save,
    Loader2,
    CheckCircle2,
    AlertCircle,
    FileJson,
    RefreshCw
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface Asset {
    id: string;
    isin: string;
    name: string;
}

export default function DevTestPanel() {
    const { selectedPortfolioId } = usePortfolio();

    // State
    const [assets, setAssets] = useState<Asset[]>([]);
    const [selectedIsin, setSelectedIsin] = useState<string>('');
    const [prompt, setPrompt] = useState<string>('');
    const [savedPrompt, setSavedPrompt] = useState<string>('');
    const [response, setResponse] = useState<string>('');
    const [isValidJson, setIsValidJson] = useState<boolean | null>(null);

    // Loading states
    const [loadingAssets, setLoadingAssets] = useState<boolean>(false);
    const [loadingPrompt, setLoadingPrompt] = useState<boolean>(false);
    const [testingLlm, setTestingLlm] = useState<boolean>(false);
    const [savingPrompt, setSavingPrompt] = useState<boolean>(false);

    // Status messages
    const [saveStatus, setSaveStatus] = useState<'success' | 'error' | null>(null);
    const [testError, setTestError] = useState<string>('');

    // Computed
    const hasChanges = prompt !== savedPrompt;

    // Load assets from portfolio
    const fetchAssets = useCallback(async () => {
        if (!selectedPortfolioId) {
            setAssets([]);
            return;
        }

        setLoadingAssets(true);
        try {
            const res = await axios.get(`/api/portfolio/assets?portfolio_id=${selectedPortfolioId}`);
            setAssets(res.data.assets || []);
        } catch (error) {
            console.error('Failed to fetch assets:', error);
            setAssets([]);
        } finally {
            setLoadingAssets(false);
        }
    }, [selectedPortfolioId]);

    // Load prompt template
    const fetchPrompt = useCallback(async () => {
        setLoadingPrompt(true);
        try {
            const res = await axios.get('/api/dev/prompt');
            const p = res.data.prompt || '';
            setPrompt(p);
            setSavedPrompt(p);
        } catch (error) {
            console.error('Failed to fetch prompt:', error);
        } finally {
            setLoadingPrompt(false);
        }
    }, []);

    useEffect(() => {
        fetchAssets();
    }, [fetchAssets]);

    useEffect(() => {
        fetchPrompt();
    }, [fetchPrompt]);

    // Save prompt
    const handleSavePrompt = async () => {
        setSavingPrompt(true);
        setSaveStatus(null);
        try {
            await axios.post('/api/dev/prompt', { prompt });
            setSavedPrompt(prompt);
            setSaveStatus('success');
            setTimeout(() => setSaveStatus(null), 3000);
        } catch (error: any) {
            console.error('Failed to save prompt:', error);
            setSaveStatus('error');
        } finally {
            setSavingPrompt(false);
        }
    };

    // Test LLM
    const handleTestLlm = async () => {
        if (!selectedIsin) return;

        setTestingLlm(true);
        setResponse('');
        setTestError('');
        setIsValidJson(null);

        try {
            const res = await axios.post('/api/dev/test-llm', {
                isin: selectedIsin,
                prompt: prompt // Send current (possibly modified) prompt
            });

            setResponse(res.data.response || '');
            setIsValidJson(res.data.is_valid_json);
        } catch (error: any) {
            console.error('LLM test failed:', error);
            setTestError(error.response?.data?.error || error.message);
        } finally {
            setTestingLlm(false);
        }
    };

    // Reset prompt to saved version
    const handleResetPrompt = () => {
        setPrompt(savedPrompt);
    };

    return (
        <div className="space-y-8">
            <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
                    <Bug className="text-white w-7 h-7" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-white">Dev Test</h2>
                    <p className="text-slate-400 mt-1">Test del prompt LLM per recupero informazioni asset</p>
                </div>
                <Badge variant="outline" className="ml-auto border-amber-500/30 text-amber-400 bg-amber-500/10">
                    DEV MODE
                </Badge>
            </div>

            <div className="grid grid-cols-1 gap-6">
                {/* ASSET SELECTION */}
                <Card className="bg-card/50 backdrop-blur-md border-white/40">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-foreground">
                            <span className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                                <FileJson className="w-4 h-4" />
                            </span>
                            Seleziona Asset
                        </CardTitle>
                        <CardDescription>Scegli un asset dal portfolio per testare il prompt</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {!selectedPortfolioId ? (
                            <p className="text-amber-400 text-sm">⚠️ Seleziona prima un portfolio dalla sidebar</p>
                        ) : loadingAssets ? (
                            <div className="flex items-center gap-2 text-slate-400">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Caricamento asset...
                            </div>
                        ) : assets.length === 0 ? (
                            <p className="text-slate-400 text-sm">Nessun asset nel portfolio selezionato</p>
                        ) : (
                            <Select value={selectedIsin} onValueChange={setSelectedIsin}>
                                <SelectTrigger className="w-full bg-secondary/20 border-white/10">
                                    <SelectValue placeholder="Seleziona un asset..." />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-white/10">
                                    {assets.map((asset) => (
                                        <SelectItem key={asset.id} value={asset.isin} className="text-white hover:bg-white/10">
                                            <span className="font-mono text-blue-400">{asset.isin}</span>
                                            <span className="ml-2 text-slate-400">- {asset.name}</span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </CardContent>
                </Card>

                {/* PROMPT EDITOR */}
                <Card className="bg-card/50 backdrop-blur-md border-white/40">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2 text-foreground">
                                <span className="p-2 bg-violet-500/10 rounded-lg text-violet-500">
                                    <Bug className="w-4 h-4" />
                                </span>
                                Prompt Template
                                {hasChanges && (
                                    <Badge variant="outline" className="ml-2 border-amber-500/30 text-amber-400">
                                        Modificato
                                    </Badge>
                                )}
                            </CardTitle>
                            <div className="flex gap-2">
                                {hasChanges && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleResetPrompt}
                                        className="text-slate-400 hover:text-white"
                                    >
                                        <RefreshCw className="w-4 h-4 mr-1" />
                                        Reset
                                    </Button>
                                )}
                            </div>
                        </div>
                        <CardDescription>
                            Modifica il prompt usato per recuperare informazioni asset.
                            Usa <code className="bg-slate-800 px-1 rounded">{'{isin}'}</code> e <code className="bg-slate-800 px-1 rounded">{'{template}'}</code> come placeholder.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {loadingPrompt ? (
                            <div className="flex items-center gap-2 text-slate-400 h-40">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Caricamento prompt...
                            </div>
                        ) : (
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                className="w-full h-64 p-4 bg-slate-900/50 border border-white/10 rounded-lg text-slate-200 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                                placeholder="Inserisci il prompt template..."
                            />
                        )}

                        <div className="flex items-center justify-between pt-2">
                            <div className="flex items-center gap-2">
                                {saveStatus === 'success' && (
                                    <div className="flex items-center gap-2 text-emerald-400 text-sm">
                                        <CheckCircle2 className="w-4 h-4" />
                                        Prompt salvato!
                                    </div>
                                )}
                                {saveStatus === 'error' && (
                                    <div className="flex items-center gap-2 text-red-400 text-sm">
                                        <AlertCircle className="w-4 h-4" />
                                        Errore durante il salvataggio
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-3">
                                <Button
                                    onClick={handleSavePrompt}
                                    disabled={!hasChanges || savingPrompt}
                                    className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50"
                                >
                                    {savingPrompt ? (
                                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    ) : (
                                        <Save className="w-4 h-4 mr-2" />
                                    )}
                                    Salva Prompt
                                </Button>
                                <Button
                                    onClick={handleTestLlm}
                                    disabled={!selectedIsin || testingLlm}
                                    className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
                                >
                                    {testingLlm ? (
                                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    ) : (
                                        <Play className="w-4 h-4 mr-2" />
                                    )}
                                    Test LLM
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* RESPONSE VIEWER */}
                <Card className="bg-card/50 backdrop-blur-md border-white/40">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-foreground">
                            <span className="p-2 bg-emerald-500/10 rounded-lg text-emerald-500">
                                <FileJson className="w-4 h-4" />
                            </span>
                            Risposta LLM
                            {isValidJson !== null && (
                                <Badge
                                    variant="outline"
                                    className={isValidJson
                                        ? "ml-2 border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                                        : "ml-2 border-red-500/30 text-red-400 bg-red-500/10"
                                    }
                                >
                                    {isValidJson ? '✓ JSON Valido' : '✗ JSON Non Valido'}
                                </Badge>
                            )}
                        </CardTitle>
                        <CardDescription>Output del modello (sola lettura)</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {testError ? (
                            <div className="p-4 rounded-lg border border-red-500/20 bg-red-500/5 text-red-400">
                                <div className="flex items-center gap-2 mb-2">
                                    <AlertCircle className="w-5 h-5" />
                                    <span className="font-medium">Errore</span>
                                </div>
                                <p className="text-sm">{testError}</p>
                            </div>
                        ) : testingLlm ? (
                            <div className="flex items-center justify-center gap-3 h-40 text-slate-400">
                                <Loader2 className="w-6 h-6 animate-spin" />
                                <span>Interrogazione LLM in corso...</span>
                            </div>
                        ) : response ? (
                            <textarea
                                value={response}
                                readOnly
                                className="w-full h-96 p-4 bg-slate-900/50 border border-white/10 rounded-lg text-slate-200 font-mono text-xs resize-none focus:outline-none"
                            />
                        ) : (
                            <div className="h-40 flex items-center justify-center text-slate-500 border border-dashed border-white/10 rounded-lg">
                                Seleziona un asset e clicca "Test LLM" per vedere la risposta
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
