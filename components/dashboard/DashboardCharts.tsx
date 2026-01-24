'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, Tooltip, Legend, LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine } from 'recharts';

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
import { Checkbox } from "@/components/ui/checkbox";

export function DashboardCharts({ allocationData, history }: DashboardChartsProps) {
    const [dateRange, setDateRange] = useState<number[]>([0, 0]);
    const [yRange, setYRange] = useState<number[]>([0, 100]);
    const [showMajorGrid, setShowMajorGrid] = useState(true);
    const [showMinorGrid, setShowMinorGrid] = useState(false);

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

    // Compute min/max Y values from all data for the Y-axis slider bounds
    const { yMin, yMax } = useMemo(() => {
        if (!history || !history.portfolio) return { yMin: -50, yMax: 100 };

        const allValues: number[] = [];
        history.portfolio.forEach(d => allValues.push(d.value));
        history.series?.forEach(s => s.data.forEach(d => allValues.push(d.value)));

        if (allValues.length === 0) return { yMin: -50, yMax: 100 };

        const min = Math.floor(Math.min(...allValues));
        const max = Math.ceil(Math.max(...allValues));

        // Add some padding to the range
        const padding = Math.max(10, Math.abs(max - min) * 0.1);
        return {
            yMin: Math.floor(min - padding),
            yMax: Math.ceil(max + padding)
        };
    }, [history]);

    // 2. Initialize ranges when data loads
    useEffect(() => {
        if (rawChartData.length > 0) {
            setDateRange([0, rawChartData.length - 1]);
        }
    }, [rawChartData.length]);

    // Initialize Y range when data loads
    useEffect(() => {
        setYRange([yMin, yMax]);
    }, [yMin, yMax]);

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

    // Compute tick values for Y-axis (major and minor)
    const { majorTicks, minorTicks, allTicks, majorStep } = useMemo(() => {
        const [min, max] = yRange;
        const range = max - min;
        const majorStep = range > 50 ? 20 : range > 20 ? 10 : 5;
        // Only 1 minor tick between each major tick (divide by 2 instead of 5)
        const minorStep = majorStep / 2;

        const majorTicks: number[] = [];
        const minorTicks: number[] = [];

        // Generate major ticks with rounding
        const startMajor = Math.ceil(min / majorStep) * majorStep;
        for (let v = startMajor; v <= max; v += majorStep) {
            majorTicks.push(Math.round(v));
        }

        // Generate minor ticks (only if minor grid is enabled)
        if (showMinorGrid) {
            const startMinor = Math.ceil(min / minorStep) * minorStep;
            for (let v = startMinor; v <= max; v += minorStep) {
                const roundedV = Math.round(v * 10) / 10; // Round to 1 decimal place
                // Skip positions that are major ticks (use approximate comparison)
                const isMajorTick = majorTicks.some(mt => Math.abs(mt - roundedV) < 0.01);
                if (!isMajorTick) {
                    minorTicks.push(roundedV);
                }
            }
        }

        // Combine and sort all ticks
        const allTicks = [...majorTicks, ...minorTicks].sort((a, b) => a - b);

        return { majorTicks, minorTicks, allTicks, majorStep };
    }, [yRange, showMinorGrid]);

    // Custom tick component for Y-axis
    const CustomYAxisTick = ({ x, y, payload }: any) => {
        const value = payload.value;
        const isMajor = majorTicks.includes(value);
        const isZero = value === 0;
        const isPositive = value > 0;
        const isNegative = value < 0;

        // Determine color: green for positive, red for negative, white for zero
        const color = isZero ? '#ffffff' : isPositive ? '#22c55e' : '#ef4444';

        // Format label: add + for positive, keep - for negative
        const label = isPositive ? `+${value}%` : `${value}%`;

        return (
            <text
                x={x}
                y={y}
                dy={4}
                textAnchor="end"
                fill={color}
                fontSize={isMajor ? 12 : 9}
                fontWeight={isZero ? 'bold' : 'normal'}
                opacity={isMajor ? 1 : 0.7}
            >
                {label}
            </text>
        );
    };


    if (!history || !history.portfolio) {
        return <div className="p-4 text-center text-muted-foreground">Caricamento grafico...</div>
    }

    return (
        <div className="grid gap-4 md:grid-cols-1 mt-4">
            <Card className="bg-card/80 backdrop-blur-xl border-white/20 shadow-lg px-6 pt-6">
                <CardHeader className="px-0 pt-0 pb-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-xl font-medium tracking-tight">Andamento MWR nel Tempo</CardTitle>
                            <p className="text-sm text-muted-foreground">Performance Money-Weighted per asset e portafoglio</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="major-grid"
                                    checked={showMajorGrid}
                                    onCheckedChange={(checked) => setShowMajorGrid(checked === true)}
                                    className="border-white/50"
                                />
                                <label htmlFor="major-grid" className="text-xs text-muted-foreground cursor-pointer">
                                    Major Grid
                                </label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="minor-grid"
                                    checked={showMinorGrid}
                                    onCheckedChange={(checked) => setShowMinorGrid(checked === true)}
                                    className="border-white/50"
                                />
                                <label htmlFor="minor-grid" className="text-xs text-muted-foreground cursor-pointer">
                                    Minor Grid
                                </label>
                            </div>
                        </div>
                    </div>
                </CardHeader>

                {/* Chart area with Y-axis slider on the left */}
                <div className="flex items-stretch">
                    {/* Y-Axis Slider (Vertical) */}
                    <div className="flex flex-col items-center justify-between pr-3 py-2" style={{ height: '450px' }}>
                        <span className="text-xs text-muted-foreground writing-mode-vertical">{yRange[1]}%</span>
                        <RangeSlider
                            min={yMin}
                            max={yMax}
                            step={1}
                            value={yRange}
                            onValueChange={setYRange}
                            orientation="vertical"
                            className="h-[380px]"
                            inverted
                        />
                        <span className="text-xs text-muted-foreground writing-mode-vertical">{yRange[0]}%</span>
                    </div>

                    {/* Chart */}
                    <CardContent className="p-0 h-[450px] flex-1">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                                data={chartData}
                                margin={{ top: 10, right: 30, left: 0, bottom: 20 }}
                            >
                                {/* Major Gridlines */}
                                {showMajorGrid && (
                                    <CartesianGrid
                                        strokeDasharray="0"
                                        stroke="#475569"
                                        opacity={0.5}
                                        vertical={false}
                                        horizontalCoordinatesGenerator={({ yAxis }) => {
                                            if (!yAxis) return [];
                                            const { scale } = yAxis;
                                            const [min, max] = [yRange[0], yRange[1]];
                                            const range = max - min;
                                            // Major gridlines every 10%
                                            const step = range > 50 ? 20 : range > 20 ? 10 : 5;
                                            const ticks = [];
                                            for (let v = Math.ceil(min / step) * step; v <= max; v += step) {
                                                ticks.push(scale(v));
                                            }
                                            return ticks;
                                        }}
                                    />
                                )}
                                {/* Minor Gridlines - using ReferenceLine for reliable rendering */}
                                {showMinorGrid && minorTicks.map((tick) => (
                                    <ReferenceLine
                                        key={`minor-grid-${tick}`}
                                        y={tick}
                                        stroke="#64748b"
                                        strokeDasharray="4 6"
                                        strokeOpacity={0.6}
                                    />
                                ))}
                                {/* Zero line - bold white */}
                                <ReferenceLine
                                    y={0}
                                    stroke="#ffffff"
                                    strokeWidth={2}
                                    strokeOpacity={0.8}
                                />
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
                                    tickLine={false}
                                    axisLine={false}
                                    domain={[yRange[0], yRange[1]]}
                                    allowDataOverflow={true}
                                    ticks={allTicks}
                                    tick={<CustomYAxisTick />}
                                />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc', borderRadius: '8px' }}
                                    itemStyle={{ padding: 0 }}
                                    formatter={(value: number) => [`${value.toFixed(2)}%`, '']}
                                    labelFormatter={(label) => new Date(label).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                                />
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
                </div>

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
