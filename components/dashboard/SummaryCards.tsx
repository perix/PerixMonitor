import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpRight, ArrowDownRight, DollarSign, Percent, TrendingUp } from "lucide-react";

interface DashboardSummary {
    total_value: number;
    total_invested: number;
    pl_value: number;
    pl_percent: number;
    xirr: number;
}

export function SummaryCards({ data }: { data: DashboardSummary }) {
    const isPositive = data.pl_value >= 0;
    const isXirrPositive = data.xirr >= 0;

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-slate-300">Valore Totale</CardTitle>
                    <DollarSign className="h-4 w-4 text-slate-400" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-white">€ {data.total_value.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</div>
                    <p className="text-xs text-slate-400">Patrimonio attuale</p>
                </CardContent>
            </Card>

            <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-slate-300">investito Netto</CardTitle>
                    <DollarSign className="h-4 w-4 text-slate-400" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-white">€ {data.total_invested.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</div>
                    <p className="text-xs text-slate-400">Capitale versato</p>
                </CardContent>
            </Card>

            <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-slate-300">Profitto / Perdita</CardTitle>
                    {isPositive ? (
                        <ArrowUpRight className="h-4 w-4 text-green-500" />
                    ) : (
                        <ArrowDownRight className="h-4 w-4 text-red-500" />
                    )}
                </CardHeader>
                <CardContent>
                    <div className={`text-2xl font-bold ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                        {isPositive ? '+' : ''}€ {data.pl_value.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                    </div>
                    <p className={`text-xs ${isPositive ? 'text-green-500/80' : 'text-red-500/80'}`}>
                        {isPositive ? '+' : ''}{data.pl_percent.toLocaleString('it-IT', { minimumFractionDigits: 2 })}%
                    </p>
                </CardContent>
            </Card>

            <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-slate-300">XIRR (Annuale)</CardTitle>
                    <TrendingUp className="h-4 w-4 text-slate-400" />
                </CardHeader>
                <CardContent>
                    <div className={`text-2xl font-bold ${isXirrPositive ? 'text-blue-400' : 'text-orange-400'}`}>
                        {data.xirr.toLocaleString('it-IT', { minimumFractionDigits: 2 })}%
                    </div>
                    <p className="text-xs text-slate-400">Rendimento pesato</p>
                </CardContent>
            </Card>
        </div>
    );
}
