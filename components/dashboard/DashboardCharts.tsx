'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, Tooltip, Legend, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';

const COLORS = ['#0ea5e9', '#22c55e', '#eab308', '#f97316', '#a855f7', '#ec4899', '#6366f1', '#14b8a6'];

interface DashboardChartsProps {
    allocationData: { name: string; value: number; sector: string }[];
    history: {
        series: { isin: string; name: string; data: { date: string; value: number }[] }[];
        portfolio: { date: string; value: number }[];
    };
}

import { useState, useMemo, useEffect } from "react";
import { RangeSlider } from "@/components/ui/range-slider";

export function DashboardCharts({ allocationData, history }: DashboardChartsProps) {
    const [dateRange, setDateRange] = useState<number[]>([0, 0]);

    // 1. Prepare raw data (all dates)
    const rawChartData = useMemo(() => {
        if (!history || !history.portfolio) return [];

        const allDates = new Set<string>();
        history.portfolio.forEach(d => allDates.add(d.date));
        history.series?.forEach(s => s.data.forEach(d => allDates.add(d.date)));
        const sortedDates = Array.from(allDates).sort();

        return sortedDates.map(date => {
            const item: any = { date };
            const portVal = history.portfolio.find(d => d.date === date);
            if (portVal) item.Portfolio = portVal.value;
            history.series?.forEach(s => {
                const val = s.data.find(d => d.date === date);
                if (val) item[s.name] = val.value;
            });
            return item;
        });
    }, [history]);

    // 2. Initialize range when data loads
    useEffect(() => {
        if (rawChartData.length > 0) {
            setDateRange([0, rawChartData.length - 1]);
        }
    }, [rawChartData.length]);

    // 3. Filter data based on range indices
    const chartData = useMemo(() => {
        if (rawChartData.length === 0) return [];
        const [start, end] = dateRange;
        // Ensure valid slice
        const safeStart = Math.max(0, start);
        const safeEnd = Math.min(rawChartData.length - 1, end);

        // If start > end (shouldn't happen with slider but safety first), return empty or swap?
        if (safeStart > safeEnd) return [];

        return rawChartData.slice(safeStart, safeEnd + 1);
    }, [rawChartData, dateRange]);


    if (!history || !history.portfolio) {
        return <div className="p-4 text-center text-muted-foreground">Caricamento grafico...</div>
    }

    return (
        <div className="grid gap-4 md:grid-cols-1 mt-4">
            <Card className="bg-card/80 backdrop-blur-xl border-white/20 shadow-lg px-6 pt-6">
                <CardHeader className="px-0 pt-0 pb-4">
                    <CardTitle className="text-xl font-medium tracking-tight">Andamento MWR nel Tempo</CardTitle>
                    <p className="text-sm text-muted-foreground">Performance Money-Weighted per asset e portafoglio</p>
                </CardHeader>
                <CardContent className="p-0 h-[450px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                            data={chartData}
                            margin={{ top: 10, right: 30, left: 0, bottom: 20 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} vertical={false} />
                            <XAxis
                                dataKey="date"
                                stroke="#94a3b8"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })}
                                dy={10}
                            />
                            <YAxis
                                stroke="#94a3b8"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(val) => `${val}%`}
                            />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc', borderRadius: '8px' }}
                                itemStyle={{ padding: 0 }}
                                formatter={(value: number) => [`${value.toFixed(2)}%`, '']}
                                labelFormatter={(label) => new Date(label).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                            />
                            <Legend wrapperStyle={{ paddingTop: '20px' }} />

                            {/* Portfolio Line (Thick) */}
                            <Line
                                type="monotone"
                                dataKey="Portfolio"
                                stroke="#ffffff"
                                strokeWidth={3}
                                dot={false}
                                activeDot={{ r: 6 }}
                                name="Portafoglio Totale"
                            />

                            {/* Asset Lines */}
                            {history.series?.map((s, idx) => (
                                <Line
                                    key={s.isin}
                                    type="monotone"
                                    dataKey={s.name}
                                    stroke={COLORS[idx % COLORS.length]}
                                    strokeWidth={1.5}
                                    dot={false}
                                    strokeOpacity={0.8}
                                    name={s.name}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </CardContent>

                {/* Time Window Slider */}
                <div className="px-4 py-4 mt-2">
                    <div className="flex justify-between text-xs text-muted-foreground mb-2">
                        <span>{rawChartData.length > 0 ? new Date(rawChartData[dateRange[0]]?.date).toLocaleDateString() : ''}</span>
                        <span>Filtro Temporale</span>
                        <span>{rawChartData.length > 0 ? new Date(rawChartData[dateRange[1]]?.date || rawChartData[rawChartData.length - 1].date).toLocaleDateString() : ''}</span>
                    </div>
                    <RangeSlider
                        min={0}
                        max={Math.max(0, rawChartData.length - 1)}
                        step={1}
                        value={dateRange}
                        onValueChange={setDateRange}
                        className="w-full"
                    />
                </div>
            </Card>
        </div>
    );
}
