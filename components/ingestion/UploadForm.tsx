'use client';

import React, { useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ReconciliationModal } from './ReconciliationModal';

export const UploadForm = () => {
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [delta, setDelta] = useState<any[] | null>(null);
    const [showModal, setShowModal] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFile(e.target.files[0]);
            setError(null);
        }
    };

    const handleUpload = async () => {
        if (!file) return;
        setLoading(true);
        setError(null);

        const formData = new FormData();
        formData.append('file', file);
        // TODO: Append 'db_holdings' here once we fetch them from Supabase (or fetch them in Python)
        // For now, let's assume Python handles fetching or we send empty if strict client-side logic isn't ready.

        try {
            const response = await axios.post('/api/ingest', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            const { delta } = response.data;
            setDelta(delta);
            if (delta && delta.length > 0) {
                setShowModal(true);
            } else {
                alert("No changes detected!");
            }

        } catch (err: any) {
            console.error(err);
            // Try to get the specific error from backend JSON response
            const serverError = err.response?.data?.error;
            const genericError = err.message || "Caricamento fallito";
            setError(serverError ? `Errore Server: ${serverError}` : genericError);
        } finally {
            setLoading(false);
        }
    };

    const handleReconciliationConfirm = async (resolutions: any[]) => {
        // Send final sync command to backend
        // await axios.post('/api/sync', { changes: resolutions });
        console.log("Syncing changes:", resolutions);
        alert("Sincronizzazione simulata! (Endpoint sync backend in attesa)");
        setShowModal(false);
    };

    return (
        <div className="p-4 max-w-xl mx-auto">
            <Card>
                <CardHeader>
                    <CardTitle>Seleziona File Excel</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Input
                        type="file"
                        accept=".xlsx"
                        onChange={handleFileChange}
                    />

                    {error && (
                        <Alert variant="destructive">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    <Button
                        onClick={handleUpload}
                        disabled={!file || loading}
                        className="w-full"
                    >
                        {loading ? "Elaborazione..." : "Analizza File"}
                    </Button>
                </CardContent>
            </Card>

            {delta && (
                <ReconciliationModal
                    isOpen={showModal}
                    onClose={() => setShowModal(false)}
                    delta={delta}
                    onConfirm={handleReconciliationConfirm}
                />
            )}
        </div>
    );
};
