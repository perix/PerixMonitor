'use client';

import { PortfolioProvider } from '@/context/PortfolioContext';
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { Separator } from "@/components/ui/separator";

export function ClientProviders({ children }: { children: React.ReactNode }) {
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
