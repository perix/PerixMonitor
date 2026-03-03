import { useState, useEffect, useCallback } from "react";
import axios from "axios";

/**
 * Movement data returned by the API.
 */
export interface Movement {
    date: string;
    operation: string;        // Acquisto | Vendita | Cedola/Dividendo | Fee
    quantity: number | null;   // null for dividends/fees
    value: number;
}

/**
 * Reusable hook to fetch asset movements (transactions + dividends/fees)
 * for a specific asset in a portfolio.
 *
 * Usage:
 *   const { movements, isLoading, error, refetch } = useAssetMovements(portfolioId, assetId, isOpen);
 *
 * @param portfolioId - UUID of the portfolio
 * @param assetId - UUID of the asset
 * @param enabled - Whether to fetch data (e.g. only when modal is open)
 */
export function useAssetMovements(
    portfolioId: string | null | undefined,
    assetId: string | null | undefined,
    enabled: boolean = false
) {
    const [movements, setMovements] = useState<Movement[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchMovements = useCallback(async () => {
        if (!portfolioId || !assetId) return;

        setIsLoading(true);
        setError(null);

        try {
            const res = await axios.get('/api/asset-movements', {
                params: {
                    portfolio_id: portfolioId,
                    asset_id: assetId,
                }
            });

            if (res.data?.movements) {
                setMovements(res.data.movements);
            } else if (res.data?.error) {
                setError(res.data.error);
                setMovements([]);
            }
        } catch (err: any) {
            const message = err?.response?.data?.error
                || err?.message
                || "Errore durante il caricamento dei movimenti";
            setError(message);
            setMovements([]);
        } finally {
            setIsLoading(false);
        }
    }, [portfolioId, assetId]);

    // Auto-fetch when enabled changes to true (modal opens)
    useEffect(() => {
        if (enabled && portfolioId && assetId) {
            fetchMovements();
        }

        // Reset state when disabled or IDs change
        if (!enabled) {
            setMovements([]);
            setError(null);
        }
    }, [enabled, portfolioId, assetId, fetchMovements]);

    return { movements, isLoading, error, refetch: fetchMovements };
}
