'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import {
    Activity,
    BarChart2,
    DollarSign,
    Save,
    CheckCircle2,
    AlertCircle,
    Loader2,
} from 'lucide-react';
import axios from 'axios';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface AppConfigState {
    model: string;
    temperature: number;
    max_tokens: number;
    cost_in: number;
    cost_out: number;
    history_length: number;
}

export default function AiConfigPanel() {
    const supabase = createClient();
    const [config, setConfig] = useState<AppConfigState>({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 1000,
        cost_in: 0.15,
        cost_out: 0.6,
        history_length: 8
    });
    const [loading, setLoading] = useState<boolean>(false);
    const [testStatus, setTestStatus] = useState<'success' | 'error' | null>(null);
    const [errorMessage, setErrorMessage] = useState<string>('');

    const AVAILABLE_MODELS = [
        {
            id: 'gpt-4o-mini',
            name: 'GPT-4o Mini',
            desc: 'Veloce ed efficiente',
            default_in: 0.15,
            default_out: 0.6,
            badge: 'Consigliato',
        },
        {
            id: 'gpt-4.1',
            name: 'GPT-4.1',
            desc: 'Nuova generazione',
            default_in: 2.0,
            default_out: 8.0,
            badge: null,
        },
        {
            id: 'gpt-5-mini-2025-08-07',
            name: 'GPT-5 Mini',
            desc: 'Efficiente e smart',
            default_in: 0.25,
            default_out: 1.0,
            badge: 'Nuovo',
        },
        {
            id: 'gpt-5.2',
            name: 'GPT-5.2',
            desc: "Stato dell'arte",
            default_in: 10.0,
            default_out: 30.0,
            badge: 'Premium',
        },
        {
            id: 'gpt-4-turbo',
            name: 'GPT-4 Turbo',
            desc: 'Potente e aggiornato',
            default_in: 10.0,
            default_out: 30.0,
            badge: null,
        },
        {
            id: 'gpt-3.5-turbo',
            name: 'GPT-3.5 Turbo',
            desc: 'Economico',
            default_in: 0.5,
            default_out: 1.5,
            badge: 'Legacy',
        },
    ];

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        const { data } = await supabase
            .from('app_config')
            .select('value')
            .eq('key', 'openai_config')
            .single();
        if ((data as any)?.value) {
            setConfig((prev) => ({
                ...prev,
                ...(data as any).value
            }));
        }
    };

    const handleModelChange = (modelId: string) => {
        const modelData = AVAILABLE_MODELS.find((m) => m.id === modelId);
        setConfig((prev) => ({
            ...prev,
            model: modelId,
            cost_in: modelData ? modelData.default_in : prev.cost_in,
            cost_out: modelData ? modelData.default_out : prev.cost_out,
        }));
    };

    const testAndSave = async () => {
        setLoading(true);
        setTestStatus(null);
        setErrorMessage('');
        try {
            // 1. Validate via Python Backend
            const response = await axios.post('/api/validate-model', {
                modelType: config.model
            });

            if (!response.data.success) {
                throw new Error(response.data.error || `Il modello '${config.model}' non è accessibile.`);
            }

            const { error: dbError } = await supabase
                .from('app_config')
                .upsert({ key: 'openai_config', value: config } as any);

            if (dbError) throw dbError;
            setTestStatus('success');

        } catch (err: any) {
            console.error(err);
            setTestStatus('error');
            setErrorMessage(err.response?.data?.error || err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                    <Activity className="text-white w-7 h-7" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-white">Configurazione AI</h2>
                    <p className="text-slate-400 mt-1">Gestisci il modello OpenAI e i parametri di generazione</p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6">

                {/* MODEL SELECTION */}
                <Card className="bg-card/50 backdrop-blur-md border-white/10">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-foreground">
                            <span className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                                <Activity className="w-4 h-4" />
                            </span>
                            Modello LLM
                        </CardTitle>
                        <CardDescription>Seleziona il modello di linguaggio da utilizzare</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {AVAILABLE_MODELS.map((m) => (
                                <div
                                    key={m.id}
                                    onClick={() => handleModelChange(m.id)}
                                    className={`relative p-4 rounded-xl border cursor-pointer transition-all duration-200 ${config.model === m.id
                                        ? 'bg-blue-500/10 border-blue-500/50 ring-1 ring-blue-500/50'
                                        : 'bg-secondary/20 border-white/20 hover:bg-secondary/30 hover:border-white/30'
                                        }`}
                                >
                                    {m.badge && (
                                        <Badge
                                            className={`absolute -top-2.5 right-3 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider
                                                ${m.badge === 'Consigliato' ? 'bg-emerald-500 text-emerald-950' : 'bg-violet-500 text-violet-50'}
                                            `}
                                        >
                                            {m.badge}
                                        </Badge>
                                    )}
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className={`w-2 h-2 rounded-full ${config.model === m.id ? 'bg-blue-500' : 'bg-slate-600'}`} />
                                        <span className={`font-semibold ${config.model === m.id ? 'text-primary' : 'text-muted-foreground'}`}>
                                            {m.name}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground pl-4">{m.desc}</p>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* PARAMETERS */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="bg-card/50 backdrop-blur-md border-white/10">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-foreground">
                                <span className="p-2 bg-violet-500/10 rounded-lg text-violet-500">
                                    <BarChart2 className="w-4 h-4" />
                                </span>
                                Parametri
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Temperature */}
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <Label className="text-foreground">Creatività (Temperatura)</Label>
                                    <Badge variant="outline" className="text-violet-400 border-violet-500/20 bg-violet-500/5">
                                        {config.temperature.toFixed(1)}
                                    </Badge>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="2"
                                    step="0.1"
                                    value={config.temperature}
                                    onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
                                    className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-violet-500"
                                />
                                <div className="flex justify-between text-[10px] text-muted-foreground uppercase font-medium">
                                    <span>Preciso</span>
                                    <span>Creativo</span>
                                </div>
                            </div>

                            <Separator className="bg-white/10" />

                            {/* Max Tokens */}
                            <div className="space-y-2">
                                <Label className="text-foreground">Token Massimi</Label>
                                <Input
                                    type="number"
                                    value={config.max_tokens}
                                    onChange={(e) => setConfig({ ...config, max_tokens: parseInt(e.target.value) || 0 })}
                                    className="bg-secondary/20 border-white/10 text-foreground font-mono"
                                />
                            </div>

                            <Separator className="bg-white/10" />

                            {/* History Length */}
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <Label className="text-foreground">Memoria Chat (Messaggi)</Label>
                                    <Badge variant="outline" className="text-blue-400 border-blue-500/20 bg-blue-500/5">
                                        {config.history_length || 8}
                                    </Badge>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="20"
                                    step="2"
                                    value={config.history_length || 8}
                                    onChange={(e) => setConfig({ ...config, history_length: parseInt(e.target.value) })}
                                    className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                                <p className="text-xs text-muted-foreground">Numero di messaggi precedenti mantenuti nel contesto.</p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-card/50 backdrop-blur-md border-white/10">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-foreground">
                                <span className="p-2 bg-emerald-500/10 rounded-lg text-emerald-500">
                                    <DollarSign className="w-4 h-4" />
                                </span>
                                Costi API
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-foreground">Costo Input ($ / 1M token)</Label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 font-bold">$</span>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={config.cost_in}
                                        onChange={(e) => setConfig({ ...config, cost_in: parseFloat(e.target.value) || 0 })}
                                        className="pl-8 bg-secondary/20 border-white/10 text-foreground text-lg font-mono"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-foreground">Costo Output ($ / 1M token)</Label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 font-bold">$</span>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={config.cost_out}
                                        onChange={(e) => setConfig({ ...config, cost_out: parseFloat(e.target.value) || 0 })}
                                        className="pl-8 bg-secondary/20 border-white/10 text-foreground text-lg font-mono"
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* ACTION BAR */}
                <div className="flex items-center justify-end gap-4 pt-4">
                    {testStatus === 'success' && (
                        <div className="flex items-center gap-2 text-emerald-400 bg-emerald-500/10 px-4 py-2 rounded-lg border border-emerald-500/20">
                            <CheckCircle2 className="w-5 h-5" />
                            <span className="text-sm font-medium">Validazione Completata e Salvata!</span>
                        </div>
                    )}
                    {testStatus === 'error' && (
                        <div className="flex items-center gap-2 text-red-400 bg-red-500/10 px-4 py-2 rounded-lg border border-red-500/20 max-w-md">
                            <AlertCircle className="w-5 h-5 shrink-0" />
                            <span className="text-sm font-medium truncate">{errorMessage}</span>
                        </div>
                    )}

                    <Button
                        onClick={testAndSave}
                        disabled={loading}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold h-12 px-8 rounded-xl shadow-lg shadow-indigo-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                                Validazione in corso...
                            </>
                        ) : (
                            <>
                                <Save className="w-5 h-5 mr-2" />
                                Salva Configurazione
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
