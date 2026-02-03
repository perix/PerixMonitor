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
    Globe,
    Search
} from 'lucide-react';
import axios from 'axios';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';

interface AppConfigState {
    model: string;
    temperature: number;
    max_tokens: number;
    cost_in: number;
    cost_out: number;
    reasoning_effort?: string;
    web_search_enabled: boolean;
}

interface ModelCapability {
    reasoning: boolean;
    web_search: boolean;
    temperature: boolean;
}

interface ModelDefinition {
    id: string;
    name: string;
    desc: string;
    default_in: number;
    default_out: number;
    badge: string | null;
    capabilities: ModelCapability;
}

export default function AiConfigPanel() {
    const supabase = createClient();
    const [config, setConfig] = useState<AppConfigState>({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 1000,
        cost_in: 0.15,
        cost_out: 0.6,
        reasoning_effort: 'medium',
        web_search_enabled: false
    });
    const [loading, setLoading] = useState<boolean>(false);
    const [testStatus, setTestStatus] = useState<'success' | 'error' | null>(null);
    const [errorMessage, setErrorMessage] = useState<string>('');

    const AVAILABLE_MODELS: ModelDefinition[] = [
        {
            id: 'gpt-4o-mini',
            name: 'GPT-4o Mini',
            desc: 'Veloce ed efficiente',
            default_in: 0.15,
            default_out: 0.6,
            badge: 'Consigliato',
            capabilities: { reasoning: false, web_search: false, temperature: true }
        },
        {
            id: 'gpt-4.5-preview',
            name: 'GPT-4.5',
            desc: 'Reasoning & Vision',
            default_in: 75.0,
            default_out: 225.0,
            badge: 'New',
            capabilities: { reasoning: false, web_search: true, temperature: true }
        },
        {
            id: 'gpt-5-mini', // Hypothetical ID as per user context
            name: 'GPT-5 Mini',
            desc: 'Next-Gen Reasoning',
            default_in: 0.25,
            default_out: 1.0,
            badge: 'Nuovo',
            capabilities: { reasoning: true, web_search: true, temperature: false }
        },
        {
            id: 'gpt-4-turbo',
            name: 'GPT-4 Turbo',
            desc: 'Potente e aggiornato',
            default_in: 10.0,
            default_out: 30.0,
            badge: null,
            capabilities: { reasoning: false, web_search: true, temperature: true }
        },
        {
            id: 'o1-mini',
            name: 'O1 Mini',
            desc: 'Ragionamento puro',
            default_in: 3.0,
            default_out: 12.0,
            badge: 'Reasoning',
            capabilities: { reasoning: true, web_search: false, temperature: false }
        }
    ];

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        try {
            const response = await axios.get('/api/settings/ai');
            if (response.data) {
                setConfig((prev) => ({
                    ...prev,
                    ...response.data
                }));
            }
        } catch (error) {
            console.error("Error loading config:", error);
            // Fallback defaults are already in state
        }
    };

    const handleModelChange = (modelId: string) => {
        const modelData = AVAILABLE_MODELS.find((m) => m.id === modelId);
        if (!modelData) return;

        setConfig((prev) => {
            const newState = {
                ...prev,
                model: modelId,
                cost_in: modelData.default_in,
                cost_out: modelData.default_out,
            };

            // Reset or Set defaults based on capabilities
            if (modelData.capabilities.reasoning) {
                newState.reasoning_effort = prev.reasoning_effort || 'medium';
            } else {
                newState.reasoning_effort = undefined;
            }

            // Web Search defaults
            if (!modelData.capabilities.web_search) {
                newState.web_search_enabled = false;
            }

            return newState;
        });
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

            // 2. Save via Backend API (Secure Service Role)
            const saveRes = await axios.post('/api/settings/ai', config);

            if (saveRes.status !== 200) {
                throw new Error("Failed to save configuration");
            }

            setTestStatus('success');

        } catch (err: any) {
            console.error(err);
            setTestStatus('error');
            setErrorMessage(err.response?.data?.error || err.message);
        } finally {
            setLoading(false);
        }
    };

    // Helper to get current model capabilities
    const currentModelDef = AVAILABLE_MODELS.find(m => m.id === config.model);
    const capabilities = currentModelDef?.capabilities || { reasoning: false, web_search: false, temperature: true };

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
                <Card className="bg-card/50 backdrop-blur-md border-white/40">
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
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {AVAILABLE_MODELS.map((m) => (
                                <div
                                    key={m.id}
                                    onClick={() => handleModelChange(m.id)}
                                    className={`relative p-4 rounded-xl border cursor-pointer transition-all duration-200 ${config.model === m.id
                                        ? 'bg-blue-500/10 border-blue-500/50 ring-1 ring-blue-500/50'
                                        : 'bg-white/5 border-white/30 hover:bg-white/10 hover:border-white/40'
                                        }`}
                                >
                                    {m.badge && (
                                        <Badge
                                            className={`absolute -top-2.5 right-3 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider
                                                ${m.badge === 'Consigliato' ? 'bg-emerald-500 text-emerald-950' :
                                                    m.badge === 'Nuovo' ? 'bg-amber-500 text-amber-950' : 'bg-violet-500 text-violet-50'}
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
                                    <p className="text-xs text-muted-foreground pl-4 mb-2">{m.desc}</p>

                                    {/* Capabilities Icons */}
                                    <div className="flex gap-2 pl-4 mt-2">
                                        {m.capabilities.web_search && (
                                            <span title="Web Search">
                                                <Globe className="w-3 h-3 text-cyan-400" />
                                            </span>
                                        )}
                                        {m.capabilities.reasoning && (
                                            <span title="Reasoning">
                                                <Activity className="w-3 h-3 text-amber-400" />
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* PARAMETERS */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="bg-card/50 backdrop-blur-md border-white/40">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-foreground">
                                <span className="p-2 bg-violet-500/10 rounded-lg text-violet-500">
                                    <BarChart2 className="w-4 h-4" />
                                </span>
                                Parametri
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">

                            {/* Reasoning Effort (Only for Reasoning Models) */}
                            {capabilities.reasoning && (
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <Label className="text-foreground">Reasoning Effort</Label>
                                        <Badge variant="outline" className="text-amber-400 border-amber-500/20 bg-amber-500/5 uppercase">
                                            {config.reasoning_effort || 'medium'}
                                        </Badge>
                                    </div>
                                    <select
                                        value={config.reasoning_effort || 'medium'}
                                        onChange={(e) => setConfig({ ...config, reasoning_effort: e.target.value })}
                                        className="w-full bg-slate-900 border border-white/30 rounded-lg p-2 text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                                    >
                                        <option value="none">None (Fastest)</option>
                                        <option value="low">Low</option>
                                        <option value="medium">Medium (Default)</option>
                                        <option value="high">High (Maximum Reasoning)</option>
                                    </select>
                                    <p className="text-xs text-muted-foreground">Controlla la profondità di ragionamento.</p>
                                    <Separator className="bg-white/10 mt-3" />
                                </div>
                            )}

                            {/* Web Search (Only for supported models) */}
                            {capabilities.web_search && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-1">
                                            <Label className="text-foreground flex items-center gap-2">
                                                <Globe className="w-4 h-4 text-cyan-400" />
                                                Web Search
                                            </Label>
                                            <p className="text-xs text-muted-foreground">Consenti al modello di cercare info online.</p>
                                        </div>
                                        <Switch
                                            checked={config.web_search_enabled}
                                            onCheckedChange={(checked) => setConfig({ ...config, web_search_enabled: checked })}
                                            className="data-[state=checked]:bg-cyan-500"
                                        />
                                    </div>
                                    <Separator className="bg-white/10 mt-3" />
                                </div>
                            )}

                            {/* Temperature (Only if NOT Reasoning) */}
                            {capabilities.temperature && (
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
                                    <Separator className="bg-white/10" />
                                </div>
                            )}

                            {/* Max Tokens */}
                            <div className="space-y-2">
                                <Label className="text-foreground">Token Massimi</Label>
                                <Input
                                    type="number"
                                    value={config.max_tokens}
                                    onChange={(e) => setConfig({ ...config, max_tokens: parseInt(e.target.value) || 0 })}
                                    className="bg-white/5 border-white/30 text-foreground font-mono"
                                />
                            </div>

                        </CardContent>
                    </Card>

                    <Card className="bg-card/50 backdrop-blur-md border-white/40">
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
                                        className="pl-8 bg-white/5 border-white/30 text-foreground text-lg font-mono"
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
                                        className="pl-8 bg-white/5 border-white/30 text-foreground text-lg font-mono"
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
