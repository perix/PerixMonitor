'use client';

import { UploadForm } from '@/components/ingestion/UploadForm';

export default function UploadPage() {
    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h2 className="text-3xl font-bold tracking-tight">Caricamento Dati</h2>
                <p className="text-muted-foreground">
                    Carica il tuo file Excel per sincronizzare le transazioni.
                    Tutte le modifiche verranno verificate prima del salvataggio.
                </p>
            </div>

            <div className="max-w-4xl mx-auto mt-8">
                <UploadForm />
            </div>
        </div>
    );
}
