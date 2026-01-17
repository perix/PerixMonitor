import { UploadForm } from '@/components/ingestion/UploadForm';

export default function UploadPage() {
    return (
        <div className="container mx-auto py-10">
            <h1 className="text-3xl font-bold mb-6 text-center">Caricamento Portafoglio</h1>
            <p className="text-center text-gray-500 mb-8">
                Carica il tuo file Excel per aggiornare il portafoglio.
                Il sistema rileverà le modifiche e chiederà conferma.
            </p>
            <UploadForm />
        </div>
    );
}
