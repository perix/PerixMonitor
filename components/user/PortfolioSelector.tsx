'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { createClient } from '@/utils/supabase/client';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Button } from '@/components/ui/button';
import { PlusCircle, Loader2, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface Portfolio {
    id: string;
    name: string;
    description: string;
    user_id: string;
}

interface PortfolioSelectorProps {
    selectedPortfolioId: string | null;
    onSelect: (id: string) => void;
}

export const PortfolioSelector: React.FC<PortfolioSelectorProps> = ({ selectedPortfolioId, onSelect }) => {
    const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newPortfolioName, setNewPortfolioName] = useState("");
    const [creating, setCreating] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);

    const supabase = createClient();

    useEffect(() => {
        fetchUserAndPortfolios();
    }, []);

    const fetchUserAndPortfolios = async () => {
        setLoading(true);
        // Check User
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            console.log("No user logged in for PortfolioSelector");
            setLoading(false);
            return;
        }
        setUserId(user.id);

        // Fetch Portfolios
        const { data, error } = await supabase
            .from('portfolios')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error("Error fetching portfolios:", error);
        } else {
            setPortfolios(data || []);
            // Auto-select first if none selected
            if (data && data.length > 0 && !selectedPortfolioId) {
                onSelect(data[0].id);
            }
        }
        setLoading(false);
    };

    const handleCreatePortfolio = async () => {
        if (!newPortfolioName.trim() || !userId) return;
        setCreating(true);

        try {
            // Use Backend API for logging
            const response = await axios.post('/api/portfolios', {
                user_id: userId,
                name: newPortfolioName
            });
            const data = response.data;

            setPortfolios([data, ...portfolios]);
            onSelect(data.id);
            setNewPortfolioName("");
            setIsCreateOpen(false);
        } catch (e: any) {
            alert(`Error creating portfolio: ${e.response?.data?.error || e.message}`);
        }
        setCreating(false);
    };

    const handleDeletePortfolio = async () => {
        if (!selectedPortfolioId) return;

        const portfolioName = portfolios.find(p => p.id === selectedPortfolioId)?.name;
        if (!confirm(`Sei sicuro di voler eliminare il portafoglio "${portfolioName}"? Questa azione è irreversibile e cancellerà tutte le transazioni associate.`)) return;

        setLoading(true);
        try {
            // Use Backend API for logging
            await axios.delete(`/api/portfolios/${selectedPortfolioId}`);

            // Update local state
            const newInfos = portfolios.filter(p => p.id !== selectedPortfolioId);
            setPortfolios(newInfos);
            // Select another one if available
            if (newInfos.length > 0) {
                onSelect(newInfos[0].id);
            } else {
                onSelect(""); // Clear selection
            }
            alert("Portafoglio eliminato.");
        } catch (e: any) {
            alert(`Errore durante l'eliminazione: ${e.response?.data?.error || e.message}`);
        }
        setLoading(false);
    };

    if (loading) return <div className="flex items-center text-sm text-gray-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Caricamento portafogli...</div>;

    if (!userId) {
        return <div className="text-sm text-red-500">Effettua il login per gestire i portafogli.</div>;
    }

    return (
        <div className="flex items-center space-x-2">
            <Select value={selectedPortfolioId || "none"} onValueChange={onSelect}>
                <SelectTrigger className="w-[250px] bg-white text-black font-medium border-none focus:ring-2 focus:ring-blue-500">
                    <SelectValue placeholder="Seleziona Portafoglio" />
                </SelectTrigger>
                <SelectContent>
                    {portfolios.length === 0 ? (
                        <SelectItem value="none" disabled>Nessun portafoglio</SelectItem>
                    ) : (
                        portfolios.map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))
                    )}
                </SelectContent>
            </Select>
            <Button
                variant="secondary"
                size="icon"
                onClick={() => setIsCreateOpen(true)}
                title="Nuovo Portafoglio"
                className="bg-white text-black hover:bg-gray-200 border-none"
            >
                <PlusCircle className="h-5 w-5" />
            </Button>

            {selectedPortfolioId && (
                <Button
                    variant="destructive"
                    size="icon"
                    onClick={handleDeletePortfolio}
                    title="Elimina Portafoglio"
                    className="bg-red-500 hover:bg-red-600 text-white border-none"
                >
                    <Trash2 className="h-5 w-5" />
                </Button>
            )}

            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="bg-white text-black">
                    <DialogHeader>
                        <DialogTitle>Crea Nuovo Portafoglio</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="name" className="text-right">
                                Nome
                            </Label>
                            <Input
                                id="name"
                                value={newPortfolioName}
                                onChange={(e) => setNewPortfolioName(e.target.value)}
                                className="col-span-3 border-gray-300"
                                placeholder="Es. Portafoglio Personale"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit" onClick={handleCreatePortfolio} disabled={creating} className="bg-black text-white hover:bg-gray-800">
                            {creating ? "Creazione..." : "Crea"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};
