'use client';

import React, { useState, useEffect } from "react";
import { PanelHeader } from "@/components/layout/PanelHeader";
import { Download, AlertCircle, FileText, Bot, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePortfolio } from "@/context/PortfolioContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useReport, ReportData } from "@/hooks/useReport";
import { generatePdfReport } from "@/lib/pdfGenerator";

export default function ExportPage() {
    const { selectedPortfolioId, portfolios } = usePortfolio();
    const selectedPortfolioName = portfolios?.find(p => p.id === selectedPortfolioId)?.name || 'Portafoglio';

    // Form State
    const [rangeType, setRangeType] = useState('YTD');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const [advisoryCost, setAdvisoryCost] = useState<number>(0);
    const [wealthTaxRate, setWealthTaxRate] = useState<number>(0.20); // Presentato %
    const [stampDuty, setStampDuty] = useState(true);
    const [enableLlm, setEnableLlm] = useState(false);

    const { generateReportData, generateLlmAnalysis, isLoading, isGeneratingLlm, error } = useReport(selectedPortfolioId);

    // Gestione range predefiniti
    useEffect(() => {
        const today = new Date();
        let end = new Date();
        let start = new Date();

        switch (rangeType) {
            case 'YTD':
                start = new Date(today.getFullYear(), 0, 1);
                break;
            case 'LAST_YEAR':
                start = new Date(today.getFullYear() - 1, 0, 1);
                end = new Date(today.getFullYear() - 1, 11, 31);
                break;
            case 'LAST_SEMESTER': {
                const currentMonth = today.getMonth(); // 0-11
                const currentYear = today.getFullYear();

                if (currentMonth < 6) {
                    // Siamo nel H1, l'ultimo semestre è l'H2 dell'anno precedente
                    start = new Date(currentYear - 1, 6, 1);     // 1 Luglio
                    end = new Date(currentYear - 1, 11, 31);     // 31 Dicembre
                } else {
                    // Siamo nel H2, l'ultimo semestre è l'H1 dell'anno corrente
                    start = new Date(currentYear, 0, 1);         // 1 Gennaio
                    end = new Date(currentYear, 5, 30);          // 30 Giugno
                }
                break;
            }
            case 'LAST_QUARTER': {
                const currentMonth = today.getMonth(); // 0-11
                const currentQuarter = Math.floor(currentMonth / 3); // 0 per Q1, 1 per Q2, ecc.
                const currentYear = today.getFullYear();

                if (currentQuarter === 0) {
                    // Siamo nel Q1, l'ultimo trimestre è il Q4 dell'anno precedente
                    start = new Date(currentYear - 1, 9, 1);     // 1 Ottobre
                    end = new Date(currentYear - 1, 11, 31);     // 31 Dicembre
                } else {
                    // L'ultimo trimestre è quello precedente dell'anno corrente
                    const lastQuarter = currentQuarter - 1;
                    start = new Date(currentYear, lastQuarter * 3, 1);
                    end = new Date(currentYear, (lastQuarter * 3) + 3, 0); // Ultimo giorno del mese
                }
                break;
            }
            case 'CUSTOM':
                // Non auto-aggiornare se custom e già settate
                if (startDate && endDate) return;
                start.setMonth(today.getMonth() - 1);
                break;
        }

        // Convert to YYYY-MM-DD
        const toDString = (d: Date) => {
            const tempDate = new Date(d); // just in case
            tempDate.setHours(12, 0, 0, 0); // Evitiamo problemi fuso orario quando usiamo toISOString
            return tempDate.toISOString().split('T')[0];
        };

        setStartDate(toDString(start));
        setEndDate(toDString(end));
    }, [rangeType]);

    const handleGenerate = async () => {
        if (!selectedPortfolioId) return;
        if (!startDate || !endDate) return;

        try {
            console.log("Generazione report per portafoglio:", selectedPortfolioId, "dal", startDate, "a", endDate);

            // 1. Fetch Backend Data
            const reportData = await generateReportData(startDate, endDate, {
                advisory: Number(advisoryCost) || 0,
                wealthTaxRate: (Number(wealthTaxRate) || 0) / 100, // as decimal
                stampDuty: stampDuty
            });
            if (!reportData) return; // Error handled by hook

            // 2. Fetch LLM se richiesto
            let llmText = null;
            if (enableLlm) {
                console.log("Richiesta LLM Analysis per il report in corso...");
                llmText = await generateLlmAnalysis(reportData);
            }

            console.log("Dati elaborati, generazione PDF in corso...");
            // 3. Genera e scarica PDF
            generatePdfReport(reportData, {
                advisory: Number(advisoryCost) || 0,
                wealthTaxRate: (Number(wealthTaxRate) || 0) / 100,
                stampDuty: stampDuty
            }, llmText, selectedPortfolioName);

            console.log("Report PDF generato con successo!");

        } catch (err: any) {
            console.error("Errore generale non previsto durante la procedura:", err);
            // Forza uno sfogo su console o alert in caso di errore silente
            alert(`Errore Fatale: ${err?.message || JSON.stringify(err)}`);
        }
    };

    if (!selectedPortfolioId) {
        return (
            <div className="p-6">
                <PanelHeader title="Export Report">
                    <Download className="w-5 h-5 text-slate-500" />
                </PanelHeader>
                <div className="mt-6 flex flex-col items-center justify-center h-[50vh] text-slate-400">
                    <AlertCircle className="w-12 h-12 mb-4 text-slate-500" />
                    <p>Seleziona un portafoglio per procedere con l'esportazione.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto h-full overflow-y-auto">
            <PanelHeader title={`Esporta Report PDF - ${selectedPortfolioName}`}>
                <FileText className="w-6 h-6 text-indigo-400" />
            </PanelHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* INFORMAZIONI */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <FileText className="w-5 h-5 text-indigo-400" />
                        Info Report
                    </h3>
                    <p className="text-sm text-slate-300">
                        Questa funzione permette di generare un report in formato PDF sulle performance complessive del portafoglio selezionato all'interno di una finestra temporale specifica.
                    </p>
                    <ul className="text-sm text-slate-400 list-disc pl-5 space-y-2 mt-2">
                        <li>Dettaglio e P&L degli asset comprati e venduti.</li>
                        <li>Transazioni di acquisto, transazioni di vendita e calcolo plusvalenze.</li>
                        <li>Rendimenti e liste cedole/dividendi percepite.</li>
                        <li>Analisi dei costi di tenuta contabile.</li>
                        <li>(Opzionale) Analisi descrittiva effettuata dall'A.I. in sintesi.</li>
                    </ul>
                </div>

                {/* CONTROLLI */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Settings2Icon className="w-5 h-5 text-indigo-400" />
                        Parametri
                    </h3>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-3 rounded-lg text-sm flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* RANGE */}
                    <div className="space-y-3">
                        <Label>Finestra Temporale</Label>
                        <Select value={rangeType} onValueChange={setRangeType}>
                            <SelectTrigger className="w-full bg-slate-950/50 border-slate-800">
                                <SelectValue placeholder="Seleziona periodo..." />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800">
                                <SelectItem value="YTD">Da inizio anno (YTD)</SelectItem>
                                <SelectItem value="LAST_QUARTER">Ultimo Trimestre</SelectItem>
                                <SelectItem value="LAST_SEMESTER">Ultimo Semestre</SelectItem>
                                <SelectItem value="LAST_YEAR">Anno Precedente Completo</SelectItem>
                                <SelectItem value="CUSTOM">Date Personalizzate</SelectItem>
                            </SelectContent>
                        </Select>

                        {rangeType === 'CUSTOM' && (
                            <div className="grid grid-cols-2 gap-4 mt-2">
                                <div>
                                    <Label className="text-xs text-slate-500">Data Inizio</Label>
                                    <Input
                                        type="date"
                                        value={startDate}
                                        onChange={e => setStartDate(e.target.value)}
                                        className="bg-slate-950/50 border-slate-800 mt-1"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs text-slate-500">Data Fine</Label>
                                    <Input
                                        type="date"
                                        value={endDate}
                                        onChange={e => setEndDate(e.target.value)}
                                        className="bg-slate-950/50 border-slate-800 mt-1"
                                    />
                                </div>
                            </div>
                        )}
                        {rangeType !== 'CUSTOM' && (
                            <div className="text-xs text-slate-500 italic mt-1 pl-1">
                                {startDate ? startDate.split('-').reverse().join('/') : ''} a {endDate ? endDate.split('-').reverse().join('/') : ''}
                            </div>
                        )}
                    </div>

                    {/* COSTI */}
                    <div className="space-y-4 pt-4 border-t border-slate-800">
                        <Label className="text-indigo-400">Parametri Costi per Simulazione</Label>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label className="text-xs text-slate-400">Costo Consulenza / Gestione (€ annuo)</Label>
                                <Input
                                    type="number" step="0.01"
                                    value={advisoryCost}
                                    onChange={e => setAdvisoryCost(Number(e.target.value))}
                                    className="bg-slate-950/50 border-slate-800 mt-1"
                                />
                            </div>
                            <div>
                                <Label className="text-xs text-slate-400">Imposta Patrimoniale (% annua)</Label>
                                <Input
                                    type="number" step="0.01"
                                    value={wealthTaxRate}
                                    onChange={e => setWealthTaxRate(Number(e.target.value))}
                                    className="bg-slate-950/50 border-slate-800 mt-1"
                                />
                                <span className="text-[10px] text-slate-600">Default: 0.20% su dossier titoli. Imposta 0 per ignorarla.</span>
                            </div>
                        </div>

                        <div className="flex items-center space-x-2 bg-slate-950/30 p-3 rounded border border-slate-800">
                            <Checkbox
                                id="stamp"
                                checked={stampDuty}
                                onCheckedChange={(checked) => setStampDuty(!!checked)}
                                className="border-slate-700"
                            />
                            <Label htmlFor="stamp" className="text-sm font-normal text-slate-300 cursor-pointer">
                                Applica imposta di bollo fissa (34.20€ annui per c/c superiore a 5000€)
                            </Label>
                        </div>
                    </div>

                    {/* LLM */}
                    <div className="space-y-4 pt-4 border-t border-slate-800">
                        <Label className="text-cyan-400 flex items-center gap-2">
                            <Bot className="w-4 h-4" />
                            Funzioni A.I. Avanzate
                        </Label>
                        <div className="flex items-start space-x-2 bg-cyan-950/20 p-3 rounded border border-cyan-900/50 group hover:border-cyan-500/50 transition-colors">
                            <Checkbox
                                id="llm"
                                checked={enableLlm}
                                onCheckedChange={(checked) => setEnableLlm(!!checked)}
                                className="border-cyan-700/50 data-[state=checked]:bg-cyan-600 mt-1"
                            />
                            <div className="grid gap-1">
                                <Label htmlFor="llm" className="text-sm font-medium text-cyan-50 cursor-pointer">
                                    Includi Analisi LLM Descrittiva
                                </Label>
                                <p className="text-xs text-slate-400">
                                    Genera automaticamente un parere descrittivo sugli eventi macroeconomici salienti che hanno caratterizzato il periodo, analizzando le performance in relazione al mercato.
                                    <br />
                                    <span className="text-cyan-600/80 font-medium">Potrebbe rallentare la generazione del report di 10-20 secondi.</span>
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* AZIONE */}
                    <div className="pt-6">
                        <Button
                            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold h-12 text-lg shadow-xl shadow-indigo-900/20 transition-all"
                            onClick={handleGenerate}
                            disabled={isLoading || isGeneratingLlm || !startDate || !endDate}
                        >
                            {isLoading || isGeneratingLlm ? (
                                <>
                                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                    {isGeneratingLlm ? "Analisi LLM in corso..." : "Generazione Dati in corso..."}
                                </>
                            ) : (
                                <>
                                    <Download className="w-5 h-5 mr-2" />
                                    Genera PDF Report
                                </>
                            )}
                        </Button>
                    </div>

                </div>
            </div>
        </div>
    );
}

// Simple icon internal for UI
function Settings2Icon(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M20 7h-9" />
            <path d="M14 17H5" />
            <circle cx="17" cy="17" r="3" />
            <circle cx="7" cy="7" r="3" />
        </svg>
    )
}
