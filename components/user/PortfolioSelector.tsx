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
import { usePortfolio } from '@/context/PortfolioContext';

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
    const { portfolios, loadingPortfolios, refreshPortfolios } = usePortfolio();
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newPortfolioName, setNewPortfolioName] = useState("");
    const [creating, setCreating] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);

    const supabase = createClient();

    useEffect(() => {
        const fetchUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) setUserId(user.id);
        };
        fetchUser();
    }, []);

    // Auto-select first portfolio if current selection is invalid
    useEffect(() => {
        if (portfolios.length > 0 && !loadingPortfolios) {
            const isValid = selectedPortfolioId && portfolios.some(p => p.id === selectedPortfolioId);
            if (!isValid) {
                onSelect(portfolios[0].id);
            }
        } else if (portfolios.length === 0 && !loadingPortfolios && selectedPortfolioId) {
            onSelect("");
        }
    }, [portfolios, loadingPortfolios]);

    const handleCreatePortfolio = async () => {
        if (!newPortfolioName.trim() || !userId) return;
        setCreating(true);

        try {
            console.log("PORTFOLIO SELECTOR: Creating new portfolio", newPortfolioName);
            const response = await axios.post('/api/portfolios', {
                user_id: userId,
                name: newPortfolioName
            });
            const data = response.data;
            console.log("PORTFOLIO SELECTOR: Created", data);

            // Refresh the global portfolio list
            await refreshPortfolios();
            // Select the newly created portfolio
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

        setDeleting(true);
        try {
            await axios.delete(`/api/portfolios/${selectedPortfolioId}`);

            // Refresh the global portfolio list
            await refreshPortfolios();
            alert("Portafoglio eliminato.");
        } catch (e: any) {
            alert(`Errore durante l'eliminazione: ${e.response?.data?.error || e.message}`);
        }
        setDeleting(false);
    };

    if (loadingPortfolios && portfolios.length === 0) return <div className="flex items-center text-sm text-gray-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Caricamento portafogli...</div>;

    if (!userId) {
        return <div className="text-sm text-red-500">Effettua il login per gestire i portafogli.</div>;
    }

    return (
        <div className="flex items-center space-x-2">
            <Select value={selectedPortfolioId || "none"} onValueChange={onSelect}>
                <SelectTrigger className="w-[280px] bg-background text-foreground border-white/20 focus:ring-2 focus:ring-ring">
                    <SelectValue placeholder="Seleziona Portafoglio" />
                </SelectTrigger>
                <SelectContent className="bg-popover text-popover-foreground border-white/20">
                    {portfolios.length === 0 ? (
                        <SelectItem value="none" disabled>Nessun portafoglio</SelectItem>
                    ) : (
                        portfolios.map(p => (
                            <SelectItem key={p.id} value={p.id} className="focus:bg-accent focus:text-accent-foreground">{p.name}</SelectItem>
                        ))
                    )}
                </SelectContent>
            </Select>
            <Button
                variant="outline"
                size="icon"
                onClick={() => setIsCreateOpen(true)}
                title="Nuovo Portafoglio"
                className="hover:bg-accent hover:text-accent-foreground border-input"
            >
                <PlusCircle className="h-5 w-5" />
            </Button>

            {selectedPortfolioId && (
                <Button
                    variant="destructive"
                    size="icon"
                    onClick={handleDeletePortfolio}
                    title="Elimina Portafoglio"
                    className="hover:bg-destructive/90"
                >
                    <Trash2 className="h-5 w-5" />
                </Button>
            )}

            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="bg-background text-foreground border-border sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Crea Nuovo Portafoglio</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="name" className="text-right text-foreground">
                                Nome
                            </Label>
                            <Input
                                id="name"
                                value={newPortfolioName}
                                onChange={(e) => setNewPortfolioName(e.target.value)}
                                className="col-span-3 bg-secondary/20 border-input text-foreground"
                                placeholder="Es. Portafoglio Personale"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit" onClick={handleCreatePortfolio} disabled={creating} className="bg-primary text-primary-foreground hover:bg-primary/90">
                            {creating ? "Creazione..." : "Crea"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};
