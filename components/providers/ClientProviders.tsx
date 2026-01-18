'use client';

import { PortfolioProvider } from '@/context/PortfolioContext';

export function ClientProviders({ children }: { children: React.ReactNode }) {
    return (
        <PortfolioProvider>
            {children}
        </PortfolioProvider>
    );
}
