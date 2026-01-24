'use client';

import { PortfolioProvider } from '@/context/PortfolioContext';
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
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
            <SidebarProvider>
                <AppSidebar />
                <main className="w-full relative">
                    <div className="p-6">
                        {children}
                    </div>
                </main>
            </SidebarProvider>
        </PortfolioProvider>
    );
}
