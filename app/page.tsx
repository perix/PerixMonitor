'use client';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import axios from 'axios';

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

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex">
        <p className="text-black text-xl font-bold font-serif tracking-wide fixed left-0 top-0 flex w-full justify-center border-b border-gray-300 bg-gradient-to-b from-zinc-200 pb-6 pt-8 backdrop-blur-2xl dark:border-neutral-800 dark:bg-zinc-800/30 dark:from-inherit lg:static lg:w-auto  lg:rounded-xl lg:border lg:bg-gray-200 lg:p-4 lg:dark:bg-zinc-800/30">
          PerixMonitor - Wealth Tracker
        </p>
      </div>

      <div className="relative flex place-items-center before:absolute before:h-[300px] before:w-[480px] before:-translate-x-1/2 before:rounded-full before:bg-gradient-to-br before:from-transparent before:to-blue-700 before:opacity-10 before:blur-2xl before:content-[''] after:absolute after:-z-20 after:h-[180px] after:w-[240px] after:translate-x-1/3 after:bg-gradient-to-t after:from-sky-900 after:via-sky-900 after:blur-2xl after:content-[''] before:dark:bg-gradient-to-br before:dark:from-transparent before:dark:to-blue-700 before:dark:opacity-10 after:dark:from-sky-900 after:dark:via-[#0141ff] after:dark:opacity-40 before:lg:h-[360px] z-[-1]">
        <h1 className="text-6xl font-bold tracking-tight">
          Il tuo Patrimonio, <span className="text-blue-400">Ottimizzato.</span>
        </h1>
      </div>

      <div className="mb-32 grid text-center lg:max-w-5xl lg:w-full lg:mb-0 lg:grid-cols-3 lg:text-left gap-8 mt-16">
        <Link href="/upload" className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:text-slate-900 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30">
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
        <div className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:text-slate-900 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30 cursor-not-allowed opacity-60">
          <h2 className={`mb-3 text-2xl font-semibold`}>
            Dashboard{' '}
            <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
              -&gt;
            </span>
          </h2>
          <p className={`m-0 max-w-[30ch] text-sm opacity-50 font-medium`}>
            Visualizza performance MWR/XIRR (Presto disponibile).
          </p>
        </div>
        <div className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:text-slate-900 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30">
          <ResetButton />
        </div>
      </div>
    </main>
  );
}
