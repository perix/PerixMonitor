'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePortfolio } from '@/context/PortfolioContext';
import { createClient } from '@/utils/supabase/client';
import { SummaryCards } from '@/components/dashboard/SummaryCards';
import { DashboardCharts } from '@/components/dashboard/DashboardCharts';
import { HoldingsTable } from '@/components/dashboard/HoldingsTable';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCcw } from 'lucide-react';
import Link from 'next/link';
import axios from 'axios';

export default function DashboardPage() {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const { selectedPortfolioId } = usePortfolio();
    const router = useRouter();
    const supabase = createClient();

    useEffect(() => {
        async function checkAuthAndFetch() {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.push('/login');
                return;
            }

            if (!selectedPortfolioId) {
                // If on dashboard without portfolio, redirect home to select one
                router.push('/');
                return;
            }

            try {
                const res = await axios.get(`/api/dashboard/summary?portfolio_id=${selectedPortfolioId}`);
                setData(res.data);
            } catch (err) {
                console.error("Dashboard fetch error:", err);
                setError("Errore nel caricamento dei dati.");
            } finally {
                setLoading(false);
            }
        }

        checkAuthAndFetch();
    }, [selectedPortfolioId, router, supabase.auth]);

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
                <div className="flex flex-col items-center gap-4">
                    <RefreshCcw className="h-8 w-8 animate-spin text-blue-500" />
                    <p>Caricamento Dashboard...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
                <div className="text-center">
                    <h2 className="text-xl text-red-500 font-bold mb-2">Errore</h2>
                    <p className="mb-4">{error}</p>
                    <Link href="/">
                        <Button variant="outline">Torna alla Home</Button>
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-900 bg-gradient-to-br from-slate-900 to-slate-800 text-white pb-20">
            {/* Header */}
            <header className="border-b border-white/10 bg-slate-900/50 backdrop-blur-sm px-6 py-4 sticky top-0 z-50 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/">
                        <Button variant="ghost" size="sm" className="gap-2 text-neutral-400 hover:text-white">
                            <ArrowLeft className="h-4 w-4" />
                            <span className="hidden sm:inline">Home</span>
                        </Button>
                    </Link>
                    <div className="h-6 w-px bg-neutral-800 mx-2" />
                    <h1 className="text-lg font-semibold tracking-tight">Dashboard & Performance</h1>
                </div>
                <div>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => window.location.reload()}
                        title="Aggiorna Dati"
                        className="border-slate-700 bg-slate-800 hover:bg-slate-700"
                    >
                        <RefreshCcw className="h-4 w-4" />
                    </Button>
                </div>
            </header>

            <main className="container mx-auto p-6 max-w-7xl space-y-8">
                {/* Summary Cards */}
                <section>
                    <SummaryCards data={data} />
                </section>

                {/* Charts */}
                <section>
                    <DashboardCharts allocationData={data.allocation} />
                </section>

                {/* Holdings Table */}
                <section>
                    <HoldingsTable data={data.allocation} />
                </section>
            </main>
        </div>
    );
}
