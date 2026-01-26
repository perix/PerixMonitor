'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { ArrowRight, LayoutDashboard, ShieldCheck } from 'lucide-react';
import { PortfolioSelector } from '@/components/user/PortfolioSelector';
import { usePortfolio } from '@/context/PortfolioContext';

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const router = useRouter();
  const { selectedPortfolioId, setSelectedPortfolioId } = usePortfolio();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setLoading(false);
      if (user) {
        // Optional: Auto-redirect can be enabled here.
        // router.push('/dashboard'); 
      }
    };
    checkUser();
  }, [router]);

  return (
    <main className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center p-8 text-foreground">
      <div className="relative flex place-items-center mb-16">
        <div className="absolute -z-10 h-[300px] w-[500px] rounded-full bg-primary/20 blur-[100px] opacity-50" />
        <h1 className="text-6xl font-bold tracking-tighter text-center">
          PerixMonitor
          <span className="block text-2xl font-normal text-muted-foreground mt-4 tracking-wide font-serif">
            Wealth Tracking, <span className="text-primary font-semibold">Elevated.</span>
          </span>
        </h1>
      </div>

      <div className="grid gap-8 text-center max-w-lg w-full">
        {loading ? (
          <p className="text-muted-foreground animate-pulse">Caricamento...</p>
        ) : user ? (
          <div className="flex flex-col gap-4 animate-in fade-in zoom-in duration-500">
            <div className="bg-card/40 border border-white/5 p-6 rounded-2xl backdrop-blur-md shadow-2xl">
              <div className="flex items-center justify-center gap-2 mb-4 text-green-400">
                <ShieldCheck className="w-5 h-5" />
                <span className="text-sm font-medium">Autenticato come {user.email}</span>
              </div>

              <div className="mb-6">
                <p className="text-sm text-muted-foreground mb-2">
                  {selectedPortfolioId ? "Portafoglio Selezionato" : "Seleziona un portafoglio per iniziare"}
                </p>
                <PortfolioSelector
                  selectedPortfolioId={selectedPortfolioId}
                  onSelect={setSelectedPortfolioId}
                />
              </div>

              <div className="grid gap-3">
                <Button asChild size="lg" className="w-full text-lg h-12 shadow-primary/20 shadow-lg">
                  <Link href="/dashboard">
                    Vai alla Dashboard <ArrowRight className="ml-2 w-4 h-4" />
                  </Link>
                </Button>

              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <p className="text-lg text-muted-foreground mb-4">
              Monitora il tuo patrimonio con precisione istituzionale.
              <br />XIRR, MWR e Analisi avanzata.
            </p>
            <div className="flex gap-4 justify-center">
              <Button asChild size="lg" className="rounded-full px-8 shadow-xl hover:shadow-primary/25 transition-all">
                <Link href="/login">Accedi / Registrati</Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="rounded-full px-8 bg-transparent border-primary/20 hover:bg-primary/10">
                <Link href="#features">Scopri di più</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
