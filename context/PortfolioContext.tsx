'use client';

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';

// Define cache data types
export interface DashboardData {
    summary: any;
    history: any;
    settings: { timeWindow?: number; yAxisScale?: number; mwr_t1?: number; mwr_t2?: number } | null;
    name?: string;
    requestParams?: { mwrT1: number; mwrT2: number };
    timestamp: number;
}

export interface PortfolioData {
    assets: any[];
    name: string;
    settings?: any;
    timestamp: number;
}

interface PortfolioContextType {
    selectedPortfolioId: string | null;
    setSelectedPortfolioId: (id: string | null) => void;
    // Caching
    portfolioCache: Record<string, PortfolioData>;
    setPortfolioCache: (portfolioId: string, data: Omit<PortfolioData, 'timestamp'>) => void;

    // New Caches
    analysisCache: Record<string, any>;
    setAnalysisCache: (portfolioId: string, data: any) => void;

    assetHistoryCache: Record<string, Record<string, any>>;
    setAssetHistoryCache: (portfolioId: string, assetIsin: string, data: any) => void;

    assetSettingsCache: Record<string, Record<string, any>>;
    setAssetSettingsCache: (portfolioId: string, assetId: string, data: any) => void;

    invalidateCache: (portfolioId: string) => void;
    clearCache: () => void;
}

const PortfolioContext = createContext<PortfolioContextType | undefined>(undefined);

export const PortfolioProvider = ({ children }: { children: ReactNode }) => {
    const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(null);

    // Caches
    const [portfolioCache, setPortfolioCacheState] = useState<Record<string, PortfolioData>>({});
    const [analysisCache, setAnalysisCacheState] = useState<Record<string, any>>({});
    const [assetHistoryCache, setAssetHistoryCacheState] = useState<Record<string, Record<string, any>>>({});
    const [assetSettingsCache, setAssetSettingsCacheState] = useState<Record<string, Record<string, any>>>({});

    // Initial load from local storage - wrapped in useEffect to avoid Hydration Mismatch
    // Cache TTL: 5 minutes
    const CACHE_TTL = 5 * 60 * 1000;
    const isCacheInitialized = useRef(false);

    // Initial load from local storage
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem('selectedPortfolioId');
            if (stored) {
                console.log("PORTFOLIO CONTEXT: Loaded stored ID", stored);
                setSelectedPortfolioId(stored);
            } else {
                console.log("PORTFOLIO CONTEXT: No stored ID found");
            }

            // [PERF] Load persistent caches
            const loadCache = (key: string, setter: any) => {
                try {
                    const storedData = localStorage.getItem(key);
                    if (storedData) {
                        const parsed = JSON.parse(storedData);
                        const now = Date.now();
                        const valid: any = {};
                        let hasValid = false;
                        for (const [pid, data] of Object.entries(parsed)) {
                            // @ts-ignore
                            if (now - (data.timestamp || 0) < CACHE_TTL) {
                                valid[pid] = data;
                                hasValid = true;
                            }
                        }
                        if (hasValid) setter(valid);
                    }
                } catch (e) { console.warn(`Failed to load ${key}`, e); }
            };

            loadCache('portfolioCache', setPortfolioCacheState);

            // Mark initialized so we can start syncing back
            isCacheInitialized.current = true;
        }
    }, []);

    useEffect(() => {
        if (selectedPortfolioId) {
            console.log("PORTFOLIO CONTEXT: Saving ID to storage", selectedPortfolioId);
            localStorage.setItem('selectedPortfolioId', selectedPortfolioId);
        } else {
            console.log("PORTFOLIO CONTEXT: Clearing ID from storage");
            localStorage.removeItem('selectedPortfolioId');
        }
    }, [selectedPortfolioId]);

    // [PERF] Sync caches to localStorage on change


    useEffect(() => {
        if (isCacheInitialized.current) {
            localStorage.setItem('portfolioCache', JSON.stringify(portfolioCache));
        }
    }, [portfolioCache]);

    const setPortfolioCache = (portfolioId: string, data: Omit<PortfolioData, 'timestamp'>) => {
        setPortfolioCacheState(prev => ({
            ...prev,
            [portfolioId]: { ...data, timestamp: Date.now() }
        }));
    };

    const setAnalysisCache = (portfolioId: string, data: any) => {
        setAnalysisCacheState(prev => ({
            ...prev,
            [portfolioId]: data
        }));
    };

    const setAssetHistoryCache = (portfolioId: string, assetIsin: string, data: any) => {
        setAssetHistoryCacheState(prev => ({
            ...prev,
            [portfolioId]: {
                ...(prev[portfolioId] || {}),
                [assetIsin]: data
            }
        }));
    };

    const setAssetSettingsCache = (portfolioId: string, assetId: string, data: any) => {
        setAssetSettingsCacheState(prev => ({
            ...prev,
            [portfolioId]: {
                ...(prev[portfolioId] || {}),
                [assetId]: data
            }
        }));
    };

    const invalidateCache = (portfolioId: string) => {
        setPortfolioCacheState(prev => {
            const next = { ...prev };
            delete next[portfolioId];
            return next;
        });
        setAnalysisCacheState(prev => {
            const next = { ...prev };
            delete next[portfolioId];
            return next;
        });
        setAssetHistoryCacheState(prev => {
            const next = { ...prev };
            delete next[portfolioId];
            return next;
        });
        setAssetSettingsCacheState(prev => {
            const next = { ...prev };
            delete next[portfolioId];
            return next;
        });
    };

    const clearCache = () => {
        setPortfolioCacheState({});
        setAnalysisCacheState({});
        setAssetHistoryCacheState({});
        setAssetSettingsCacheState({});
    };

    return (
        <PortfolioContext.Provider value={{
            selectedPortfolioId,
            setSelectedPortfolioId,
            portfolioCache,
            setPortfolioCache,
            analysisCache,
            setAnalysisCache,
            assetHistoryCache,
            setAssetHistoryCache,
            assetSettingsCache,
            setAssetSettingsCache,
            invalidateCache,
            clearCache
        }}>
            {children}
        </PortfolioContext.Provider>
    );
};

export const usePortfolio = () => {
    const context = useContext(PortfolioContext);
    if (!context) {
        throw new Error('usePortfolio must be used within a PortfolioProvider');
    }
    return context;
};
