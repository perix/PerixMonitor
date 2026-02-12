'use client';

import { PortfolioProvider } from '@/context/PortfolioContext';
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import ReactQueryProvider from './ReactQueryProvider';
import { usePathname } from 'next/navigation';

export function ClientProviders({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isPublicPage = pathname === '/login' || pathname === '/change-password';

    if (isPublicPage) {
        return (
            <PortfolioProvider>
                <main className="w-full relative min-h-screen">
                    {children}
                </main>
            </PortfolioProvider>
        );
    }

    return (
        <PortfolioProvider>
            <ReactQueryProvider>
                <SidebarProvider>
                    <AppSidebar />
                    <main className="w-full relative h-screen flex flex-col overflow-y-auto">
                        {children}
                    </main>
                </SidebarProvider>
            </ReactQueryProvider>
        </PortfolioProvider>
    );
}
