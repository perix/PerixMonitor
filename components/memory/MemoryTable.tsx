"use client";

import React, { useState, useMemo, useEffect } from "react";
import axios from 'axios';
import {
    ColumnDef,
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    getFilteredRowModel,
    useReactTable,
    SortingState,
    ColumnFiltersState,
    VisibilityState,
    RowData,
} from "@tanstack/react-table";

interface TableMeta {
    editedNotes: Record<string, string>;
    onNoteChange: (id: string, value: string) => void;
}

declare module '@tanstack/table-core' {
    interface TableMeta<TData extends RowData> {
        editedNotes: Record<string, string>;
        onNoteChange: (id: string, value: string) => void;
    }
}

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowUpDown } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface MemoryData {
    id: string; // Asset ID
    isin: string;
    description: string;
    type: string;
    open_date: string;
    close_date: string | null;
    pnl: number;
    mwr: number;
    mwr_type: string;
    value: number;
    note: string;
    last_trend_variation?: number;
}

export interface MemoryTableProps {
    data: MemoryData[];
    editedNotes: Record<string, string>;
    onNoteChange: (id: string, value: string) => void;
    // Lifted State for Persistence
    sorting: SortingState;
    onSortingChange: (updaterOrValue: SortingState | ((old: SortingState) => SortingState)) => void;
    columnFilters: ColumnFiltersState;
    onColumnFiltersChange: (updaterOrValue: ColumnFiltersState | ((old: ColumnFiltersState) => ColumnFiltersState)) => void;
    columnVisibility: VisibilityState;
    onColumnVisibilityChange: (updaterOrValue: VisibilityState | ((old: VisibilityState) => VisibilityState)) => void;
    columnSizing: Record<string, number>;
    onColumnSizingChange: (updaterOrValue: Record<string, number> | ((old: Record<string, number>) => Record<string, number>)) => void;
}

// Extract Cell Component to prevent focus loss - uses local state
const NoteCell = React.memo(({ row, table }: { row: any, table: any }) => {
    const meta = table.options.meta as TableMeta;
    const id = row.original.id;
    const initialValue = row.original.note || '';
    const editedValue = meta?.editedNotes[id];
    const baseValue = editedValue !== undefined ? editedValue : initialValue;

    // Local state for editing - prevents re-renders during typing
    const [localValue, setLocalValue] = React.useState(baseValue);
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);

    // Function to auto-resize height
    const adjustHeight = React.useCallback(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = textarea.scrollHeight + 'px';
        }
    }, []);

    // Sync local state when external value changes (e.g., after save)
    React.useEffect(() => {
        setLocalValue(baseValue);
    }, [baseValue]);

    // Auto-resize on mount, value change, and when parent resizes (column width change)
    React.useEffect(() => {
        adjustHeight();

        // ResizeObserver to detect column width changes
        const textarea = textareaRef.current;
        if (!textarea) return;

        const resizeObserver = new ResizeObserver(() => {
            adjustHeight();
        });

        // Observe the parent cell for width changes
        if (textarea.parentElement) {
            resizeObserver.observe(textarea.parentElement);
        }

        return () => resizeObserver.disconnect();
    }, [localValue, adjustHeight]);

    return (
        <textarea
            ref={textareaRef}
            value={localValue}
            onChange={(e) => {
                setLocalValue(e.target.value);
                adjustHeight();
            }}
            onBlur={() => {
                // Only notify parent if value actually changed
                if (localValue !== baseValue) {
                    meta?.onNoteChange(id, localValue);
                }
            }}
            className="min-h-[1.5rem] py-1 px-2 text-xs bg-transparent border border-transparent hover:border-slate-400 focus:border-blue-500 focus:bg-white focus:text-black rounded w-full text-current placeholder:text-slate-500 resize-none overflow-hidden whitespace-pre-wrap break-words"
            placeholder="Aggiungi nota..."
            rows={1}
        />
    );
});
NoteCell.displayName = "NoteCell";

export function MemoryTable({
    data,
    editedNotes,
    onNoteChange,
    sorting,
    onSortingChange,
    columnFilters,
    onColumnFiltersChange,
    columnVisibility,
    onColumnVisibilityChange,
    columnSizing,
    onColumnSizingChange
}: MemoryTableProps) {


    const [threshold, setThreshold] = useState(0.1);

    useEffect(() => {
        axios.get('/api/config/assets').then(res => {
            if (res.data?.priceVariationThreshold !== undefined) setThreshold(res.data.priceVariationThreshold);
        }).catch(err => console.error("Failed to load asset config", err));
    }, []);

    const columns = useMemo<ColumnDef<MemoryData>[]>(() => [
        {
            accessorKey: "description",
            header: ({ column }) => (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                    className="text-left w-full pl-0 hover:bg-transparent font-bold text-black hover:text-black"
                >
                    Descrizione Titolo
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            ),

            cell: ({ row }) => {
                const variation = row.original.last_trend_variation || 0;
                const isSignificant = Math.abs(variation) >= threshold;
                const colorClass = isSignificant
                    ? (variation > 0 ? "text-green-500" : "text-red-500")
                    : ""; // Default: Inherit (slate-200 normally, slate-900 on hover)

                const formatPct = (val: number) => {
                    const sign = val >= 0 ? '+' : '';
                    return `${sign}${val.toFixed(2)}%`;
                };

                const title = `${row.getValue("description")}\nDelta: ${formatPct(variation)}`;

                return <div className={`font-medium truncate ${colorClass}`} title={title}>{row.getValue("description")}</div>;
            },
            size: 250,
        },
        {
            accessorKey: "isin",
            header: ({ column }) => (
                <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="font-bold text-black pl-0 hover:bg-transparent hover:text-black">
                    ISIN <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            ),
            cell: ({ row }) => <div className="truncate">{row.getValue("isin")}</div>,
            size: 130,
        },
        {
            accessorKey: "type",
            header: ({ column }) => (
                <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="font-bold text-black pl-0 hover:bg-transparent hover:text-black">
                    Tipologia <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            ),
            cell: ({ row }) => <div className="truncate">{row.getValue("type")}</div>,
            size: 150,
        },
        {
            accessorKey: "pnl",
            header: ({ column }) => (
                <div className="text-left w-full">
                    <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="font-bold text-black pl-0 hover:bg-transparent hover:text-black">
                        P&L <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                </div>
            ),
            cell: ({ row }) => {
                const amount = parseFloat(row.getValue("pnl"));
                const formatted = new Intl.NumberFormat("it-CH", {
                    style: "decimal",
                    minimumFractionDigits: 2,
                }).format(amount);

                return (
                    <div className={`text-right font-medium ${amount >= 0 ? "text-green-500" : "text-red-400"}`}>
                        {formatted}
                    </div>
                );
            },
            size: 120,
        },
        {
            accessorKey: "mwr",
            header: ({ column }) => (
                <div className="text-left w-full">
                    <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="font-bold text-black pl-0 hover:bg-transparent hover:text-black">
                        MWR% <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                </div>
            ),
            cell: ({ row }) => {
                const mwr = parseFloat(row.original.mwr?.toString() || "0");
                const mwrType = row.original.mwr_type || "NONE";

                if (mwrType === "NONE" || mwrType === "ERROR") {
                    return <div className="text-right text-gray-500">-</div>;
                }

                // Format with 2 decimal places and % sign
                const formatted = new Intl.NumberFormat("it-CH", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                }).format(mwr);

                // Type suffix: (S) Simple, (P) Period, (A) Annual
                let suffix = "";
                if (mwrType === "SIMPLE") suffix = " (S)";
                else if (mwrType === "PERIOD") suffix = " (P)";
                else if (mwrType === "ANNUAL") suffix = " (A)";

                return (
                    <div className={`text-right font-medium ${mwr >= 0 ? "text-green-500" : "text-red-400"}`}>
                        {formatted}%{suffix}
                    </div>
                );
            },
            size: 100,
        },
        {
            accessorKey: "value",
            header: ({ column }) => (
                <div className="text-left w-full">
                    <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="font-bold text-black pl-0 hover:bg-transparent hover:text-black">
                        Controvalore <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                </div>
            ),
            cell: ({ row }) => {
                const amount = parseFloat(row.getValue("value"));
                if (amount === 0) return <div className="text-right text-gray-500">-</div>;
                const formatted = new Intl.NumberFormat("it-CH", {
                    style: "decimal",
                    minimumFractionDigits: 2,
                }).format(amount);
                return <div className="text-right">{formatted}</div>;
            },
            size: 120,
        },
        {
            accessorKey: "open_date",
            header: ({ column }) => (
                <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="font-bold text-black pl-0 hover:bg-transparent hover:text-black">
                    Data Apertura <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            ),
            cell: ({ row }) => <div>{row.getValue<string>("open_date")?.split("T")[0]}</div>,
            size: 110,
        },
        {
            accessorKey: "close_date",
            header: ({ column }) => (
                <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="font-bold text-black pl-0 hover:bg-transparent hover:text-black">
                    Data Chiusura <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            ),
            cell: ({ row }) => {
                const val = row.getValue<string | null>("close_date");
                return val ? <div>{val.split("T")[0]}</div> : null;
            },
            size: 110,
        },
        {
            accessorKey: "note",
            header: ({ column }) => (
                <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="font-bold text-black pl-0 hover:bg-transparent hover:text-black">
                    Note <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            ),
            cell: ({ row, table }) => <NoteCell row={row} table={table} />,
            size: 300,
        },
    ], [editedNotes, onNoteChange, threshold]); // Re-create columns only if handlers change? Actually NoteCell handles updates via props.

    const table = useReactTable({
        data,
        columns,
        columnResizeMode: "onChange",
        getCoreRowModel: getCoreRowModel(),
        onSortingChange: onSortingChange,
        getSortedRowModel: getSortedRowModel(),
        onColumnFiltersChange: onColumnFiltersChange,
        getFilteredRowModel: getFilteredRowModel(),
        onColumnVisibilityChange: onColumnVisibilityChange,
        onColumnSizingChange: onColumnSizingChange,
        state: {
            sorting,
            columnFilters,
            columnVisibility,
            columnSizing,
        },
        meta: {
            editedNotes,
            onNoteChange,
        },
    });

    const uniqueTypes = useMemo(() => {
        const types = new Set(data.map(d => d.type));
        return Array.from(types).sort();
    }, [data]);

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center gap-4 flex-shrink-0 mb-2">
                {/* Filter by Type */}
                <div className="max-w-sm ml-1">
                    <select
                        value={(table.getColumn("type")?.getFilterValue() as string) || "ALL"}
                        className="h-9 w-full rounded-md border border-slate-500 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors text-foreground focus:border-slate-300"
                        onChange={(e) => {
                            const val = e.target.value;
                            table.getColumn("type")?.setFilterValue(val === "ALL" ? "" : val);
                        }}
                    >
                        <option value="ALL" className="text-black">Tutte le Tipologie</option>
                        {uniqueTypes.map(t => (
                            <option key={t} value={t} className="text-black">{t}</option>
                        ))}
                    </select>
                </div>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline">
                            Colonne
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                        {table
                            .getAllColumns()
                            .filter((column) => column.getCanHide())
                            .map((column) => {
                                return (
                                    <DropdownMenuCheckboxItem
                                        key={column.id}
                                        className="capitalize"
                                        checked={column.getIsVisible()}
                                        onCheckedChange={(value) => column.toggleVisibility(!!value)}
                                    >
                                        {column.id}
                                    </DropdownMenuCheckboxItem>
                                );
                            })}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Fixed Header Table */}
            <div className="rounded-t-md border border-slate-700 flex-shrink-0">
                <Table className="border-collapse" style={{ tableLayout: 'fixed', width: table.getTotalSize() }}>
                    <TableHeader className="bg-slate-100">
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id} className="border-b border-slate-300 hover:bg-slate-100">
                                {headerGroup.headers.map((header) => {
                                    return (
                                        <TableHead
                                            key={header.id}
                                            className="relative border-r border-slate-300 h-10 py-1 text-black font-extrabold"
                                            style={{ width: header.getSize() }}
                                        >
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(
                                                    header.column.columnDef.header,
                                                    header.getContext()
                                                )}
                                            {/* Resizer Handle */}
                                            <div
                                                onMouseDown={header.getResizeHandler()}
                                                onTouchStart={header.getResizeHandler()}
                                                className={`absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 ${header.column.getIsResizing() ? 'bg-blue-600 w-1.5' : 'bg-transparent'
                                                    }`}
                                            />
                                        </TableHead>
                                    );
                                })}
                            </TableRow>
                        ))}
                    </TableHeader>
                </Table>
            </div>

            {/* Scrollable Body Table */}
            <div className="rounded-b-md border-x border-b border-slate-700 overflow-auto flex-1 min-h-0">
                <Table className="border-collapse" style={{ tableLayout: 'fixed', width: table.getTotalSize() }}>
                    <TableBody>
                        {table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow
                                    key={row.id}
                                    data-state={row.getIsSelected() && "selected"}
                                    className="border-b border-slate-700 text-slate-200 hover:bg-sky-200 hover:text-slate-900 group"
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell
                                            key={cell.id}
                                            className="py-1 px-2 border-r border-slate-700 truncate group-hover:border-slate-400"
                                            style={{ width: cell.column.getSize() }}
                                        >
                                            {flexRender(
                                                cell.column.columnDef.cell,
                                                cell.getContext()
                                            )}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell
                                    colSpan={columns.length}
                                    className="h-24 text-center"
                                >
                                    Nessun risultato.
                                </TableCell>
                            </TableRow>
                        )}
                        {/* Summary Row - attached to last data row */}
                        <TableRow className="bg-yellow-100 font-bold text-black hover:bg-yellow-200">
                            <TableCell className="border-r border-slate-300" style={{ width: table.getColumn('description')?.getSize() }}>Totale</TableCell>
                            <TableCell className="border-r border-slate-300" style={{ width: table.getColumn('isin')?.getSize() }}></TableCell>
                            <TableCell className="border-r border-slate-300" style={{ width: table.getColumn('type')?.getSize() }}></TableCell>
                            <TableCell className="border-r border-slate-300 text-right" style={{ width: table.getColumn('pnl')?.getSize() }}>
                                {(() => {
                                    const totalPl = table.getFilteredRowModel().rows.reduce((sum, row) => sum + row.original.pnl, 0);
                                    return (
                                        <span className={totalPl >= 0 ? "text-green-700" : "text-red-600"}>
                                            {new Intl.NumberFormat("it-CH", { minimumFractionDigits: 2 }).format(totalPl)}
                                        </span>
                                    );
                                })()}
                            </TableCell>
                            <TableCell className="border-r border-slate-300" style={{ width: table.getColumn('mwr')?.getSize() }}></TableCell>
                            <TableCell className="border-r border-slate-300 text-right" style={{ width: table.getColumn('value')?.getSize() }}>
                                {(() => {
                                    const totalVal = table.getFilteredRowModel().rows.reduce((sum, row) => sum + row.original.value, 0);
                                    return new Intl.NumberFormat("it-CH", { minimumFractionDigits: 2 }).format(totalVal);
                                })()}
                            </TableCell>
                            <TableCell className="border-r border-slate-300" style={{ width: table.getColumn('open_date')?.getSize() }}></TableCell>
                            <TableCell className="border-r border-slate-300" style={{ width: table.getColumn('close_date')?.getSize() }}></TableCell>
                            <TableCell style={{ width: table.getColumn('note')?.getSize() }}></TableCell>
                        </TableRow>
                        {/* Asset count row */}
                        <TableRow className="text-muted-foreground">
                            <TableCell colSpan={columns.length} className="text-sm py-2">
                                {table.getFilteredRowModel().rows.length} asset visualizzati.
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
