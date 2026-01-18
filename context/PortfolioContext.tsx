'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface PortfolioContextType {
    selectedPortfolioId: string | null;
    setSelectedPortfolioId: (id: string | null) => void;
}

const PortfolioContext = createContext<PortfolioContextType | undefined>(undefined);

export const PortfolioProvider = ({ children }: { children: ReactNode }) => {
    const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(null);

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

    return (
        <PortfolioContext.Provider value={{ selectedPortfolioId, setSelectedPortfolioId }}>
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
