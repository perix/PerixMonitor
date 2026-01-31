import { useEffect, useState } from 'react';
import axios from 'axios';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";
import { formatSwissMoney } from "@/lib/utils";

interface AssetDetailModalProps {
    isin: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

interface AssetInfo {
    anagrafica: {
        nome_strumento: string;
        isin: string;
        emittente: string;
        garante: string;
        mercato_quotazione: string;
        data_emissione: string | null;
        data_scadenza: string | null;
        sottostanti: string[];
    };
    rating: {
        rating_emittente_sp: string;
        rating_emittente_moodys: string;
        rating_emittente_fitch: string;
        livello_rischio_kid: string;
    };
    categoria: {
        tipologia_acepi: string;
        protezione_capitale: string;
        barriera_premio: string;
        barriera_capitale: string;
    };
    ultimo_prezzo_chiusura: {
        prezzo: number;
        valuta: string;
        data_riferimento: string;
        fonte: string;
    };
}

export function AssetDetailModal({ isin, open, onOpenChange }: AssetDetailModalProps) {
    const [data, setData] = useState<AssetInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (open && isin) {
            fetchDetails(isin);
        } else {
            setData(null);
            setError(null);
        }
    }, [open, isin]);

    const fetchDetails = async (isinCode: string) => {
        setLoading(true);
        setError(null);
        try {
            const res = await axios.get(`/api/assets/${isinCode}`);
            // The API returns { asset_info: { ... } }
            if (res.data && res.data.asset_info) {
                setData(res.data.asset_info);
            } else {
                setError("Dati non disponibili");
            }
        } catch (err) {
            console.error("Error fetching asset details:", err);
            setError("Impossibile recuperare i dettagli dell'asset.");
        } finally {
            setLoading(false);
        }
    };

    if (!open) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[90vh]">
                <DialogHeader>
                    <DialogTitle className="text-xl flex items-center gap-2">
                        {loading ? "Caricamento..." : data?.anagrafica.nome_strumento || isin}
                        {data?.anagrafica.mercato_quotazione && (
                            <Badge variant="outline">{data.anagrafica.mercato_quotazione}</Badge>
                        )}
                    </DialogTitle>
                    <DialogDescription>
                        Dettagli completi dello strumento finanziario (ISIN: {isin})
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="h-[600px] w-full pr-4">
                    {loading && (
                        <div className="flex h-40 items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                        </div>
                    )}

                    {error && (
                        <div className="p-4 bg-red-500/10 text-red-400 rounded-md">
                            {error}
                        </div>
                    )}

                    {data && !loading && (
                        <div className="space-y-6">
                            {/* Anagrafica */}
                            <section>
                                <h3 className="text-lg font-semibold mb-3 text-indigo-400">Anagrafica</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                    <div className="flex flex-col">
                                        <span className="text-neutral-400">Emittente</span>
                                        <span className="font-medium">{data.anagrafica.emittente}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-neutral-400">Garante</span>
                                        <span className="font-medium">{data.anagrafica.garante}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-neutral-400">Data Emissione</span>
                                        <span className="font-medium">{data.anagrafica.data_emissione || 'N/A'}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-neutral-400">Data Scadenza</span>
                                        <span className="font-medium">{data.anagrafica.data_scadenza || 'N/A'}</span>
                                    </div>
                                    <div className="col-span-2 flex flex-col">
                                        <span className="text-neutral-400">Sottostanti / Settore</span>
                                        <div className="flex gap-2 mt-1">
                                            {data.anagrafica.sottostanti.length > 0 ? (
                                                data.anagrafica.sottostanti.map((s, i) => (
                                                    <Badge key={i} variant="secondary">{s}</Badge>
                                                ))
                                            ) : (
                                                <span className="text-neutral-500">N/A</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <Separator className="bg-neutral-800" />

                            {/* Prezzo e Rischio */}
                            <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div>
                                    <h3 className="text-lg font-semibold mb-3 text-indigo-400">Mercato</h3>
                                    <div className="space-y-3 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-neutral-400">Ultimo Prezzo</span>
                                            <span className="font-bold text-green-400">
                                                {formatSwissMoney(data.ultimo_prezzo_chiusura.prezzo)} {data.ultimo_prezzo_chiusura.valuta}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-neutral-400">Data Riferimento</span>
                                            <span>{data.ultimo_prezzo_chiusura.data_riferimento || '-'}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-neutral-400">Fonte Dati</span>
                                            <span className="text-xs text-neutral-500">{data.ultimo_prezzo_chiusura.fonte}</span>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-lg font-semibold mb-3 text-indigo-400">Profilo di Rischio</h3>
                                    <div className="space-y-3 text-sm">
                                        <div className="flex justify-between items-center">
                                            <span className="text-neutral-400">Rischio KID</span>
                                            <Badge variant={data.rating.livello_rischio_kid === 'N/A' ? 'outline' : 'destructive'}>
                                                {data.rating.livello_rischio_kid}
                                            </Badge>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-neutral-400">Rating S&P</span>
                                            <span>{data.rating.rating_emittente_sp}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-neutral-400">Rating Moody's</span>
                                            <span>{data.rating.rating_emittente_moodys}</span>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <Separator className="bg-neutral-800" />

                            {/* Categoria ACEPI (Placeholder for detailed Certs) */}
                            <section>
                                <h3 className="text-lg font-semibold mb-3 text-indigo-400">Struttura & Barriere</h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                    <div className="flex flex-col">
                                        <span className="text-neutral-400">Tipologia</span>
                                        <span className="font-medium">{data.categoria.tipologia_acepi}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-neutral-400">Protezione Cap.</span>
                                        <span className="font-medium">{data.categoria.protezione_capitale}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-neutral-400">Barriera Premio</span>
                                        <span className="font-medium">{data.categoria.barriera_premio}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-neutral-400">Barriera Capitale</span>
                                        <span className="font-medium">{data.categoria.barriera_capitale}</span>
                                    </div>
                                </div>
                            </section>
                        </div>
                    )}
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
