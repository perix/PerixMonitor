'use client';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import axios from 'axios';
import { createClient } from '@/utils/supabase/client';

function ResetButton() {
  const [loading, setLoading] = useState(false);
  const handleReset = async () => {
    if (!confirm("⚠️ ATTENZIONE: Questa azione cancellerà l'intero database! Sei sicuro?")) return;

    setLoading(true);
    try {
      await axios.post('/api/reset');
      alert("Database resettato con successo!");
    } catch (e) {
      alert("Errore durante il reset.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div onClick={handleReset} className="cursor-pointer">
      <h2 className={`mb-3 text-2xl font-semibold text-red-500`}>
        Reset DB{' '}
        <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
          -&gt;
        </span>
      </h2>
      <p className={`m-0 max-w-[30ch] text-sm opacity-50 font-medium`}>
        {loading ? "Cancellazione in corso..." : "Cancella tutti i dati."}
      </p>
    </div>
  )
}

import { PortfolioSelector } from '@/components/user/PortfolioSelector';
import { usePortfolio } from '@/context/PortfolioContext';

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const { selectedPortfolioId, setSelectedPortfolioId } = usePortfolio();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setLoading(false);
    };
    checkUser();
  }, []);

  const handlePortfolioSelect = (id: string) => {
    setSelectedPortfolioId(id);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex">
        <p className="text-black text-xl font-bold font-serif tracking-wide fixed left-0 top-0 flex w-full justify-center border-b border-gray-300 bg-gradient-to-b from-zinc-200 pb-6 pt-8 backdrop-blur-2xl dark:border-neutral-800 dark:bg-zinc-800/30 dark:from-inherit lg:static lg:w-auto  lg:rounded-xl lg:border lg:bg-gray-200 lg:p-4 lg:dark:bg-zinc-800/30">
          PerixMonitor - Wealth Tracker
        </p>
        <div className="fixed bottom-0 left-0 flex h-48 w-full items-end justify-center bg-gradient-to-t from-white via-white dark:from-black dark:via-black lg:static lg:h-auto lg:w-auto lg:bg-none">
          {loading ? (
            <div className="p-8">...</div>
          ) : user ? (
            <div className="flex items-center gap-4 p-8 lg:p-0">
              <span className="text-xs text-white/80 font-mono tracking-wider">{user.email}</span>
              <Button
                variant="secondary"
                size="sm"
                className="bg-white text-black hover:bg-gray-200 font-bold border border-gray-300"
                onClick={() => supabase.auth.signOut().then(() => setUser(null))}
              >
                Logout
              </Button>
            </div>
          ) : (
            <Link href="/login" className="flex place-items-center gap-2 p-8 lg:p-0 hover:underline">
              Login / Registrati
            </Link>
          )}
        </div>
      </div>

      <div className="relative flex place-items-center before:absolute before:h-[300px] before:w-[480px] before:-translate-x-1/2 before:rounded-full before:bg-gradient-to-br before:from-transparent before:to-blue-700 before:opacity-10 before:blur-2xl before:content-[''] after:absolute after:-z-20 after:h-[180px] after:w-[240px] after:translate-x-1/3 after:bg-gradient-to-t after:from-sky-900 after:via-sky-900 after:blur-2xl after:content-[''] before:dark:bg-gradient-to-br before:dark:from-transparent before:dark:to-blue-700 before:dark:opacity-10 after:dark:from-sky-900 after:dark:via-[#0141ff] after:dark:opacity-40 before:lg:h-[360px] z-[-1]">
        <h1 className="text-6xl font-bold tracking-tight">
          Il tuo Patrimonio, <span className="text-blue-400">Ottimizzato.</span>
        </h1>
      </div>

      {user && (
        <div className="mt-8">
          <div className="bg-white/10 p-6 rounded-xl border border-white/20 backdrop-blur-sm">
            <h3 className="text-lg font-semibold mb-4 text-center">Seleziona Portafoglio</h3>
            <PortfolioSelector
              selectedPortfolioId={selectedPortfolioId}
              onSelect={handlePortfolioSelect}
            />
            {!selectedPortfolioId && (
              <p className="text-sm text-yellow-400 mt-2 text-center">
                Necessario selezionare un portafoglio per procedere.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="mb-32 grid text-center lg:max-w-5xl lg:w-full lg:mb-0 lg:grid-cols-3 lg:text-left gap-8 mt-16">
        {/* Upload Data Button */}
        {user ? (
          <Link href="/upload" className={`group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:text-slate-900 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30 ${!selectedPortfolioId ? 'opacity-50 pointer-events-none' : ''}`}>
            <h2 className={`mb-3 text-2xl font-semibold`}>
              Carica Dati{' '}
              <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
                -&gt;
              </span>
            </h2>
            <p className={`m-0 max-w-[30ch] text-sm opacity-50 font-medium`}>
              Importa il tuo ultimo file excel di portafoglio.
            </p>
          </Link>
        ) : (
          <div className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:text-slate-900 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30 cursor-not-allowed opacity-60" title="Effettua il login per accedere">
            <h2 className={`mb-3 text-2xl font-semibold text-gray-400`}>
              Carica Dati{' '}
              <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
                -&gt;
              </span>
            </h2>
            <p className={`m-0 max-w-[30ch] text-sm opacity-50 font-medium`}>
              Effettua il Login per caricare dati.
            </p>
          </div>
        )}

        {/* Dashboard Button */}
        {(!user || !selectedPortfolioId) ? (
          <div className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:text-slate-900 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30 cursor-not-allowed opacity-60 pointer-events-none">
            <h2 className={`mb-3 text-2xl font-semibold`}>
              Dashboard{' '}
              <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
                -&gt;
              </span>
            </h2>
            <p className={`m-0 max-w-[30ch] text-sm opacity-50 font-medium`}>
              Seleziona un portafoglio per accedere.
            </p>
          </div>
        ) : (
          <Link href="/dashboard" className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:text-slate-900 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30 cursor-pointer">
            <h2 className={`mb-3 text-2xl font-semibold`}>
              Dashboard{' '}
              <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
                -&gt;
              </span>
            </h2>
            <p className={`m-0 max-w-[30ch] text-sm opacity-50 font-medium`}>
              Visualizza performance MWR/XIRR.
            </p>
          </Link>
        )}
      </div>
    </main >
  );
}
