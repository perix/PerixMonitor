import { useState, useEffect, useCallback } from "react";
import axios from "axios";

export interface AssetPrice {
    date: string;
    price: number;
    source: string;
}

export function useAssetPrices(
    portfolioId: string | null | undefined,
    assetId: string | null | undefined,
    enabled: boolean = false,
    days: number | null = 365
) {
    const [prices, setPrices] = useState<AssetPrice[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchPrices = useCallback(async () => {
        if (!portfolioId || !assetId) return;

        setIsLoading(true);
        setError(null);

        try {
            const params: any = {
                portfolio_id: portfolioId,
                asset_id: assetId,
            };
            if (days) params.days = days;

            const res = await axios.get('/api/asset-prices', { params });

            if (res.data?.prices) {
                setPrices(res.data.prices);
            } else if (res.data?.error) {
                setError(res.data.error);
                setPrices([]);
            }
        } catch (err: any) {
            const message = err?.response?.data?.error
                || err?.message
                || "Errore durante il caricamento dei prezzi";
            setError(message);
            setPrices([]);
        } finally {
            setIsLoading(false);
        }
    }, [portfolioId, assetId, days]);

    // Auto-fetch when enabled changes to true (modal opens) or days change
    useEffect(() => {
        if (enabled && portfolioId && assetId) {
            fetchPrices();
        }

        // Reset state when disabled or IDs change
        if (!enabled) {
            setPrices([]);
            setError(null);
        }
    }, [enabled, portfolioId, assetId, days, fetchPrices]);

    const syncPrices = useCallback(async (
        isin: string,
        updates: { old_date: string; old_source: string; new_date: string; new_source: string; new_price: number }[],
        deletions: { date: string; source: string }[]
    ) => {
        try {
            await axios.post('/api/asset-prices/sync', {
                isin,
                updates,
                deletions
            });
            await fetchPrices(); // Refresh data after sync
            return { success: true };
        } catch (err: any) {
            const message = err?.response?.data?.error || err?.message || "Errore durante il salvataggio dei prezzi";
            return { success: false, error: message };
        }
    }, [fetchPrices]);

    return { prices, isLoading, error, refetch: fetchPrices, syncPrices };
}
