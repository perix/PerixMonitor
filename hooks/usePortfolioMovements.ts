import { useState, useEffect, useCallback } from "react";
import axios from "axios";

export interface PortfolioMovement {
    date: string;
    isin: string;
    description: string;
    asset_class: string;
    type: string;           // Acquisto | Vendita | Cedola/Dividendo | Fee
    quantity: number | null;
    value: number;
}

export function usePortfolioMovements(
    portfolioId: string | null | undefined,
    startDate: string | null | undefined,
    endDate: string | null | undefined,
    includeDividends: boolean = false,
    enabled: boolean = false
) {
    const [movements, setMovements] = useState<PortfolioMovement[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchMovements = useCallback(async () => {
        if (!portfolioId) return;

        setIsLoading(true);
        setError(null);

        try {
            const params: any = {
                portfolio_id: portfolioId,
                include_dividends: includeDividends
            };
            
            if (startDate) params.start_date = startDate;
            if (endDate) params.end_date = endDate;

            const res = await axios.get('/api/portfolio-movements', { params });

            if (res.data?.movements) {
                setMovements(res.data.movements);
            } else if (res.data?.error) {
                setError(res.data.error);
                setMovements([]);
            }
        } catch (err: any) {
            const message = err?.response?.data?.error
                || err?.message
                || "Errore durante il caricamento dei movimenti del portafoglio";
            setError(message);
            setMovements([]);
        } finally {
            setIsLoading(false);
        }
    }, [portfolioId, startDate, endDate, includeDividends]);

    useEffect(() => {
        if (enabled && portfolioId) {
            fetchMovements();
        }

        if (!enabled) {
            setMovements([]);
            setError(null);
        }
    }, [enabled, portfolioId, startDate, endDate, includeDividends, fetchMovements]);

    return { movements, isLoading, error, refetch: fetchMovements };
}
