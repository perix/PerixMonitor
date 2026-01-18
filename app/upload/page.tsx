import { UploadForm } from '@/components/ingestion/UploadForm';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, LayoutDashboard, Home as HomeIcon } from 'lucide-react';

export default function UploadPage() {
    return (
        <div className="min-h-screen bg-slate-900 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
            {/* Header Navigation */}
            <header className="border-b border-white/10 bg-slate-900/50 backdrop-blur-sm px-6 py-4 flex items-center justify-between sticky top-0 z-50 shadow-sm">
                <div className="flex items-center gap-4">
                    <Link href="/">
                        <Button variant="ghost" size="sm" className="gap-2 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white">
                            <ArrowLeft className="h-4 w-4" />
                            <span className="hidden sm:inline">Indietro</span>
                        </Button>
                    </Link>
                    <div className="h-6 w-px bg-neutral-200 dark:bg-neutral-800 mx-2" />
                    <h1 className="text-lg font-semibold tracking-tight">Gestione Portafoglio</h1>
                </div>

                <div className="flex items-center gap-2">
                    <Link href="/">
                        <Button variant="outline" size="sm" className="gap-2 hidden sm:flex bg-white text-black border-gray-300 hover:bg-gray-200 hover:text-black">
                            <HomeIcon className="h-4 w-4" />
                            Home
                        </Button>
                    </Link>
                    <Button variant="default" size="sm" className="gap-2 bg-blue-600 hover:bg-blue-700 text-white" disabled>
                        <LayoutDashboard className="h-4 w-4" />
                        Dashboard
                    </Button>
                </div>
            </header>

            <div className="container mx-auto py-10 max-w-4xl">
                <div className="mb-8 text-center space-y-2">
                    <h2 className="text-3xl font-bold tracking-tight text-white">Caricamento Dati</h2>
                    <p className="text-slate-300">
                        Carica il tuo file Excel per sincronizzare le transazioni.
                        Tutte le modifiche verranno verificate prima del salvataggio.
                    </p>
                </div>

                <UploadForm />
            </div>
        </div>
    );
}
