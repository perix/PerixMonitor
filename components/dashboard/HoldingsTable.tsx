import { useState } from 'react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Info } from "lucide-react";
import { AssetDetailModal } from './AssetDetailModal';
import { formatSwissMoney, formatSwissNumber } from "@/lib/utils";

interface Holding {
    name: string;
    isin: string;
    value: number;
    quantity: number;
    price: number;
    sector: string;
}

interface HoldingsTableProps {
    data: Holding[];
}

export function HoldingsTable({ data }: HoldingsTableProps) {
    const [selectedIsin, setSelectedIsin] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleOpenDetails = (isin: string) => {
        setSelectedIsin(isin);
        setIsModalOpen(true);
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white">Dettaglio Portafoglio</h2>
                <div className="text-sm text-neutral-400">
                    {data.length} posizioni
                </div>
            </div>

            <div className="bg-slate-900/50 border border-white/10 rounded-lg overflow-hidden backdrop-blur-sm">
                <Table>
                    <TableHeader className="bg-slate-900/80">
                        <TableRow className="hover:bg-transparent border-white/10">
                            <TableHead className="text-neutral-400 font-medium">Nome Strumento</TableHead>
                            <TableHead className="text-neutral-400 font-medium">ISIN</TableHead>
                            <TableHead className="text-neutral-400 font-medium">Settore</TableHead>
                            <TableHead className="text-right text-neutral-400 font-medium">Quantità</TableHead>
                            <TableHead className="text-right text-neutral-400 font-medium">Prezzo</TableHead>
                            <TableHead className="text-right text-neutral-400 font-medium">Valore Totale</TableHead>
                            <TableHead className="text-right text-neutral-400 font-medium">Azioni</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.map((holding) => (
                            <TableRow key={holding.isin} className="hover:bg-white/5 border-white/10">
                                <TableCell className="font-medium text-white max-w-[200px] truncate" title={holding.name}>
                                    {holding.name}
                                </TableCell>
                                <TableCell className="font-mono text-xs text-neutral-300">
                                    {holding.isin}
                                </TableCell>
                                <TableCell>
                                    <Badge variant="outline" className="text-xs border-neutral-700 text-neutral-300">
                                        {holding.sector}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right text-neutral-300">
                                    {formatSwissNumber(holding.quantity, 0)}
                                </TableCell>
                                <TableCell className="text-right text-neutral-300">
                                    € {formatSwissMoney(holding.price)}
                                </TableCell>
                                <TableCell className="text-right font-semibold text-white">
                                    € {formatSwissMoney(holding.value)}
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 hover:bg-indigo-500/20 hover:text-indigo-400"
                                        onClick={() => handleOpenDetails(holding.isin)}
                                    >
                                        <Info className="h-4 w-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            <AssetDetailModal
                isin={selectedIsin}
                open={isModalOpen}
                onOpenChange={setIsModalOpen}
            />
        </div>
    );
}
