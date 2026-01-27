'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// Define cache data types
export interface DashboardData {
    summary: any;
    history: any;
    settings: { timeWindow?: number; yAxisScale?: number } | null;
    timestamp: number;
}

export interface PortfolioData {
    assets: any[];
    name: string;
    timestamp: number;
}

interface PortfolioContextType {
    selectedPortfolioId: string | null;
    setSelectedPortfolioId: (id: string | null) => void;
    // Caching
    dashboardCache: Record<string, DashboardData>;
    portfolioCache: Record<string, PortfolioData>;
    setDashboardCache: (portfolioId: string, data: Omit<DashboardData, 'timestamp'>) => void;
    setPortfolioCache: (portfolioId: string, data: Omit<PortfolioData, 'timestamp'>) => void;
    invalidateCache: (portfolioId: string) => void;
}

const PortfolioContext = createContext<PortfolioContextType | undefined>(undefined);

export const PortfolioProvider = ({ children }: { children: ReactNode }) => {
    const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(null);

    // Caches
    const [dashboardCache, setDashboardCacheState] = useState<Record<string, DashboardData>>({});
    const [portfolioCache, setPortfolioCacheState] = useState<Record<string, PortfolioData>>({});

    // Initial load from local storage - wrapped in useEffect to avoid Hydration Mismatch
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem('selectedPortfolioId');
            if (stored) {
                setSelectedPortfolioId(stored);
            }
        }
    }, []);

    useEffect(() => {
        if (selectedPortfolioId) {
            localStorage.setItem('selectedPortfolioId', selectedPortfolioId);
        } else {
            localStorage.removeItem('selectedPortfolioId');
        }
    }, [selectedPortfolioId]);

    const setDashboardCache = (portfolioId: string, data: Omit<DashboardData, 'timestamp'>) => {
        setDashboardCacheState(prev => ({
            ...prev,
            [portfolioId]: { ...data, timestamp: Date.now() }
        }));
    };

    const setPortfolioCache = (portfolioId: string, data: Omit<PortfolioData, 'timestamp'>) => {
        setPortfolioCacheState(prev => ({
            ...prev,
            [portfolioId]: { ...data, timestamp: Date.now() }
        }));
    };

    const invalidateCache = (portfolioId: string) => {
        setDashboardCacheState(prev => {
            const next = { ...prev };
            delete next[portfolioId];
            return next;
        });
        setPortfolioCacheState(prev => {
            const next = { ...prev };
            delete next[portfolioId];
            return next;
        });
    };

    return (
        <PortfolioContext.Provider value={{
            selectedPortfolioId,
            setSelectedPortfolioId,
            dashboardCache,
            portfolioCache,
            setDashboardCache,
            setPortfolioCache,
            invalidateCache
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
