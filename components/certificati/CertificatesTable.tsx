"use client";

import React, { useMemo, useState } from "react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Loader2, RefreshCw, Trash2, ChevronRight, ChevronDown, ExternalLink } from "lucide-react";
import { CertificateRow, useDeleteCertificate, useRefreshCertificate } from "@/hooks/useCertificates";

function distColor(dist: number | null | undefined): string {
    if (dist === null || dist === undefined) return "text-muted-foreground";
    if (dist < 0) return "text-red-400";
    if (dist < 10) return "text-yellow-400";
    return "text-green-400";
}

function fmtSignedPct(v: number | null | undefined): string {
    if (v === null || v === undefined) return "N.D.";
    return `${v > 0 ? "+" : ""}${Number(v).toFixed(2)}%`;
}

function fmtPct(v: number | null | undefined): string {
    if (v === null || v === undefined) return "N.D.";
    return `${Number(v).toFixed(2)}%`;
}

function fmtNum(v: number | null | undefined): string {
    if (v === null || v === undefined) return "—";
    return Number(v).toFixed(2);
}

// Stile header chiaro condiviso (coerente con AssetPricesModal)
const HEAD_CLS = "bg-slate-100 text-black font-extrabold text-xs uppercase tracking-wider h-9";

export function CertificatesTable({ data }: { data: CertificateRow[] }) {
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [busyIsin, setBusyIsin] = useState<string | null>(null);
    const deleteMut = useDeleteCertificate();
    const refreshMut = useRefreshCertificate();

    // Ordina per Worst-Of crescente: i certificati più critici (barriera vicina/rotta) in alto.
    const rows = useMemo(() => {
        return [...data].sort((a, b) => {
            const av = a.worst_dist ?? Number.POSITIVE_INFINITY;
            const bv = b.worst_dist ?? Number.POSITIVE_INFINITY;
            return av - bv;
        });
    }, [data]);

    const toggle = (isin: string) =>
        setExpanded((prev) => ({ ...prev, [isin]: !prev[isin] }));

    const handleRefresh = (isin: string) => {
        setBusyIsin(isin);
        refreshMut.mutate(isin, { onSettled: () => setBusyIsin(null) });
    };

    const handleDelete = (isin: string) => {
        if (!window.confirm(`Eliminare il certificato ${isin} dalla base dati?`)) return;
        setBusyIsin(isin);
        deleteMut.mutate(isin, { onSettled: () => setBusyIsin(null) });
    };

    if (!rows.length) {
        return (
            <div className="p-8 text-center text-muted-foreground">
                Nessun certificato presente in base dati. Usa &quot;Get Info&quot; su un certificato
                nella pagina Portafoglio per analizzarlo e aggiungerlo qui.
            </div>
        );
    }

    return (
        <div className="border border-slate-700 rounded-md overflow-hidden bg-[#0A0A0A]">
            <Table>
                <TableHeader>
                    <TableRow className="hover:bg-slate-100 border-b border-slate-300">
                        <TableHead className={`${HEAD_CLS} w-8`}></TableHead>
                        <TableHead className={`${HEAD_CLS} border-r border-slate-300`}>ISIN</TableHead>
                        <TableHead className={`${HEAD_CLS} border-r border-slate-300`}>Scadenza</TableHead>
                        <TableHead className={`${HEAD_CLS} border-r border-slate-300`}>Barriera</TableHead>
                        <TableHead className={`${HEAD_CLS} border-r border-slate-300`}>Cedola</TableHead>
                        <TableHead className={`${HEAD_CLS} border-r border-slate-300`}>Flag</TableHead>
                        <TableHead className={`${HEAD_CLS} border-r border-slate-300 text-right`}>Dist. Worst-Of</TableHead>
                        <TableHead className={`${HEAD_CLS} text-center w-24`}>Azioni</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((cert) => {
                        const isOpen = !!expanded[cert.isin];
                        const isBusy = busyIsin === cert.isin;
                        return (
                            <React.Fragment key={cert.isin}>
                                <TableRow
                                    className="cursor-pointer border-b border-slate-700 hover:bg-white/5 transition-colors"
                                    onClick={() => toggle(cert.isin)}
                                >
                                    <TableCell className="align-middle">
                                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                    </TableCell>
                                    <TableCell className="font-mono font-semibold">
                                        <a
                                            href={`https://www.certificatiederivati.it/db_bs_scheda_certificato.asp?isin=${cert.isin}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            className="hover:text-primary underline inline-flex items-center gap-1"
                                            title="Apri scheda su Certificati e Derivati"
                                        >
                                            {cert.isin}
                                            <ExternalLink className="h-3 w-3" />
                                        </a>
                                    </TableCell>
                                    <TableCell>{cert.expiry_date || "N.D."}</TableCell>
                                    <TableCell>
                                        {fmtPct(cert.barrier_pct)}
                                        {cert.barrier_type ? ` (${cert.barrier_type})` : ""}
                                    </TableCell>
                                    <TableCell>
                                        {fmtPct(cert.coupon_pct)}
                                        {cert.coupon_freq ? ` (${cert.coupon_freq})` : ""}
                                    </TableCell>
                                    <TableCell className="text-xs">
                                        {cert.has_memory ? <span className="text-indigo-400 mr-2">MEM</span> : null}
                                        {cert.is_autocallable ? <span className="text-sky-400">AUTO</span> : null}
                                    </TableCell>
                                    <TableCell className={`text-right font-mono font-bold ${distColor(cert.worst_dist)}`}>
                                        {cert.worst_dist !== null && cert.worst_dist !== undefined
                                            ? fmtSignedPct(cert.worst_dist)
                                            : "N/A"}
                                    </TableCell>
                                    <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-center gap-1">
                                            <button
                                                onClick={() => handleRefresh(cert.isin)}
                                                disabled={isBusy}
                                                title="Aggiorna (rianalizza dal web)"
                                                className="p-1.5 rounded-md text-primary hover:bg-primary/10 disabled:opacity-50"
                                            >
                                                {isBusy && refreshMut.isPending ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <RefreshCw className="h-4 w-4" />
                                                )}
                                            </button>
                                            <button
                                                onClick={() => handleDelete(cert.isin)}
                                                disabled={isBusy}
                                                title="Elimina"
                                                className="p-1.5 rounded-md text-red-500 hover:bg-red-500/10 disabled:opacity-50"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                                {isOpen && (
                                    <TableRow className="hover:bg-transparent bg-black/30 border-b border-slate-700">
                                        <TableCell colSpan={8} className="p-0">
                                            <div className="px-4 py-3">
                                                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                                                    Sottostanti ({cert.underlyings_count})
                                                    {cert.last_updated ? ` · agg. ${new Date(cert.last_updated).toLocaleString("it-IT")}` : ""}
                                                </div>
                                                {cert.underlyings.length === 0 ? (
                                                    <div className="text-sm text-muted-foreground">Nessun sottostante.</div>
                                                ) : (
                                                    <div className="border border-slate-700 rounded-md overflow-hidden">
                                                        <table className="w-full text-sm">
                                                            <thead>
                                                                <tr className="bg-slate-100 text-black text-xs uppercase tracking-wider">
                                                                    <th className="px-3 py-1.5 text-left font-extrabold border-r border-slate-300">Sottostante</th>
                                                                    <th className="px-3 py-1.5 text-left font-extrabold border-r border-slate-300">Ticker</th>
                                                                    <th className="px-3 py-1.5 text-right font-extrabold border-r border-slate-300">Strike</th>
                                                                    <th className="px-3 py-1.5 text-right font-extrabold border-r border-slate-300">Barriera</th>
                                                                    <th className="px-3 py-1.5 text-right font-extrabold border-r border-slate-300">Corrente</th>
                                                                    <th className="px-3 py-1.5 text-right font-extrabold">Dist. Barriera</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {cert.underlyings.map((u, idx) => (
                                                                    <tr
                                                                        key={u.id ?? idx}
                                                                        className="border-b border-slate-700/60 last:border-0 hover:bg-white/5 transition-colors"
                                                                    >
                                                                        <td className="px-3 py-1.5 font-medium">{u.name || u.original_ticker}</td>
                                                                        <td className="px-3 py-1.5 font-mono text-muted-foreground">
                                                                            {u.corrected_ticker || u.original_ticker || "—"}
                                                                        </td>
                                                                        <td className="px-3 py-1.5 text-right font-mono">{fmtNum(u.strike)}</td>
                                                                        <td className="px-3 py-1.5 text-right font-mono">{fmtNum(u.barrier_abs ?? u.barrier)}</td>
                                                                        <td className="px-3 py-1.5 text-right font-mono font-bold text-primary">
                                                                            {u.current != null ? fmtNum(u.current) : "N.D."}
                                                                        </td>
                                                                        <td className={`px-3 py-1.5 text-right font-mono font-bold ${distColor(u.dist)}`}>
                                                                            {fmtSignedPct(u.dist)}
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </React.Fragment>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}
