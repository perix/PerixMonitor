import { useState, useCallback } from "react";
import axios from "axios";

export interface ReportData {
    portfolio_id: string;
    start_date: string;
    end_date: string;
    summary: {
        start_value: number;
        end_value: number;
        net_inflows: number;
        period_pl: number;
        mwr_percent: number;
        adjusted_mwr_percent?: number;
        estimated_wealth_tax?: number;
        estimated_stamp_duty?: number;
        estimated_advisory_cost?: number;
        total_costs?: number;
        total_dividends: number;
        realized_capital_gains: number;
        estimated_cg_tax: number;
    };
    transactions: {
        date: string;
        type: 'BUY' | 'SELL';
        isin: string;
        name: string;
        quantity: number;
        price: number;
        value: number;
        pmc?: number;
        realized_gain?: number;
    }[];
    capital_gains_detail: any[];
    dividends: {
        date: string;
        name: string;
        amount: number;
        type: string;
    }[];
    best_performers: {
        isin: string;
        name: string;
        pl: number;
        pl_pct: number;
        asset_class: string;
    }[];
    worst_performers: {
        isin: string;
        name: string;
        pl: number;
        pl_pct: number;
        asset_class: string;
    }[];
}

export function useReport(portfolioId: string | null) {
    const [isLoading, setIsLoading] = useState(false);
    const [isGeneratingLlm, setIsGeneratingLlm] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const generateReportData = useCallback(async (startDate: string, endDate: string, costs: { advisory: number, wealthTaxRate: number, stampDuty: boolean }): Promise<ReportData | null> => {
        if (!portfolioId) return null;
        setIsLoading(true);
        setError(null);
        try {
            const res = await axios.get('/api/report/generate', {
                params: {
                    portfolio_id: portfolioId,
                    start_date: startDate,
                    end_date: endDate,
                    advisory_cost: costs.advisory,
                    wealth_tax_rate: costs.wealthTaxRate,
                    stamp_duty: costs.stampDuty
                }
            });
            return res.data;
        } catch (err: any) {
            setError(err?.response?.data?.error || err.message || "Errore durante la generazione dei dati del report");
            return null;
        } finally {
            setIsLoading(false);
        }
    }, [portfolioId]);

    const generateLlmAnalysis = useCallback(async (reportData: ReportData): Promise<string | null> => {
        setIsGeneratingLlm(true);
        try {
            // 1. Avvio del Job
            const startRes = await axios.post('/api/report/llm-analysis/start', {
                report_data: reportData
            });
            const jobId = startRes.data.job_id;
            console.log(`[LLM_POLLING] Job avviato: ${jobId}`);

            // 2. Loop di Polling
            let status = "pending";
            let resultText = null;
            let attempts = 0;
            const maxAttempts = 120; // limite di sicurezza (6 minuti con attesa 3s)

            while (status === "pending" && attempts < maxAttempts) {
                attempts++;
                // Attesa 3 secondi tra i tentativi
                await new Promise(resolve => setTimeout(resolve, 3000));

                const statusRes = await axios.get(`/api/report/llm-analysis/status/${jobId}`);
                const jobState = statusRes.data;
                status = jobState.status;

                if (status === "completed") {
                    resultText = jobState.result;
                    console.log(`[LLM_POLLING] Job ${jobId} completato con successo.`);
                } else if (status === "failed") {
                    console.error(`[LLM_POLLING] Job ${jobId} fallito:`, jobState.error);
                    throw new Error(jobState.error || "Errore durante l'analisi LLM");
                } else {
                    console.log(`[LLM_POLLING] Job ${jobId} in corso... (Tentativo ${attempts})`);
                }
            }

            if (status === "pending") {
                throw new Error("Timeout: l'analisi sta richiedendo troppo tempo.");
            }

            return resultText;
        } catch (err: any) {
            console.error("Errore Polling LLM:", err);
            setError(err?.message || "Errore durante l'analisi asincrona");
            return null;
        } finally {
            setIsGeneratingLlm(false);
        }
    }, []);

    return { generateReportData, generateLlmAnalysis, isLoading, isGeneratingLlm, error };
}
