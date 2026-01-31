'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, Tooltip, Legend, LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine } from 'recharts';
import { formatSwissMoney, formatSwissNumber } from "@/lib/utils";


const COLORS = ['#0ea5e9', '#22c55e', '#eab308', '#f97316', '#a855f7', '#ec4899', '#6366f1', '#14b8a6'];

interface DashboardChartsProps {
    allocationData: { name: string; value: number; sector: string; color?: string }[];
    history: {
        series: { isin: string; name: string; color?: string; data: { date: string; value: number; pnl?: number, market_value?: number }[] }[];
        portfolio: { date: string; value: number, market_value?: number }[];
    };
    initialSettings?: {
        timeWindow?: number;
        mwr?: { yMin: number, yMax: number };
        value?: { yMin: number, yMax: number };
        // Legacy support
        yAxisScale?: number;
    };
    onSettingsChange?: (settings: any) => void;
    portfolioName?: string;
}

import { useState, useMemo, useEffect, useRef, useTransition } from "react";
import { RangeSlider } from "@/components/ui/range-slider";
import { Checkbox } from "@/components/ui/checkbox";

export function DashboardCharts({ allocationData, history, initialSettings, onSettingsChange, portfolioName }: DashboardChartsProps) {
    const [dateRange, setDateRange] = useState<number[]>([0, 0]);
    // Separate state for ranges
    const [mwrRange, setMwrRange] = useState<number[]>([0, 100]);
    const [valueRange, setValueRange] = useState<number[]>([0, 100]);

    // View Mode
    const [viewMode, setViewMode] = useState<'mwr' | 'value'>('mwr');
    const [isPending, startTransition] = useTransition();

    // Handler for viewing mode change with transition
    const handleViewModeChange = (checked: boolean) => {
        const start = performance.now();

        startTransition(() => {
            setViewMode(checked ? 'value' : 'mwr');
        });
    };

    // Tracking render time


    // Helper to get current range based on mode
    const yRange = viewMode === 'mwr' ? mwrRange : valueRange;
    const setYRange = (val: number[]) => {
        const start = performance.now();
        if (viewMode === 'mwr') {
            setMwrRange(val);
        } else {
            // For Value mode, strictly enforce 0 as minimum
            setValueRange([0, val[1]]);
        }

    };
    const [showMajorGrid, setShowMajorGrid] = useState(true);
    // Remove minor grid state interaction if not needed for the new right axis, but keep for MWR compatibility? 
    // User asked for "sempre solo le major" for Right Axis. We can keep the state for MWR or generic, 
    // but force logic in render.
    const [showMinorGrid, setShowMinorGrid] = useState(false);

    // Track if initialized to avoid overwriting user interaction with default logic
    const initializedRef = useRef(false);

    // 1. Prepare raw data (all dates) - OPTIMIZED O(N)
    const rawChartData = useMemo(() => {
        if (!history || !history.portfolio) return [];

        const allDates = new Set<string>();
        // Pre-process Portfolio data into a Map for O(1) lookup
        const portfolioMap = new Map<string, { value: number, market_value: number }>();
        history.portfolio.forEach(d => {
            allDates.add(d.date);
            portfolioMap.set(d.date, { value: d.value, market_value: d.market_value || 0 });
        });

        // Pre-process Series data into Maps
        const seriesMaps = new Map<string, Map<string, { value: number, market_value: number, pnl: number }>>();
        history.series?.forEach(s => {
            const sMap = new Map<string, { value: number, market_value: number, pnl: number }>();
            s.data.forEach(d => {
                allDates.add(d.date);
                sMap.set(d.date, { value: d.value, market_value: d.market_value || 0, pnl: d.pnl || 0 });
            });
            seriesMaps.set(s.isin, sMap);
        });

        const sortedDates = Array.from(allDates).sort();

        // Single pass construction
        return sortedDates.map(date => {
            const item: any = { date };

            // Portfolio lookup
            const portVal = portfolioMap.get(date);
            if (portVal) {
                // Determine what to put in "Portfolio" key
                // For Value Mode: we want "Portfolio" to map to the Right Axis
                // effectively the number is the same, but we might treat it differently in the chart config
                item.Portfolio = viewMode === 'value' ? portVal.market_value : portVal.value;
            }

            // Series lookup
            history.series?.forEach(s => {
                const sMap = seriesMaps.get(s.isin);
                const val = sMap?.get(date);
                if (val) {
                    const displayName = `${s.name} (${s.isin})`;
                    item[displayName] = viewMode === 'value' ? val.market_value : val.value;
                    item[`${displayName}_pnl`] = val.pnl;
                }
            });
            return item;
        });
    }, [history, viewMode]);

    // Compute min/max Y values from all data for the Y-axis slider bounds
    const { yMinLimit, yMaxLimit } = useMemo(() => {
        if (!history || !history.portfolio) return { yMinLimit: -50, yMaxLimit: 100 };

        const allValues: number[] = [];
        // Collect values based on current viewMode logic
        // In VALUE mode: The slider ONLY controls the Portfolio Axis (Right).
        // So strictly speaking, the limits should be based on Portfolio values if we want to zoom perfectly on Portfolio?
        // OR should it be consistent? User said "slider verticale deve essere attivo solo per la parte superiore"
        // and "valore di asset e portafoglio non possono essere negativi".

        // Let's collect Portfolio values for the limit calculation in Value mode, 
        // because that's what the slider controls directly.
        // Asset values will determine the Left Axis 'auto' scale.

        if (viewMode === 'value') {
            // USER REQUEST: Initialize slider to the Max Value of the largest ASSET.
            // The slider controls the Left Axis (Assets).
            // So we should collect Asset values for the limit calculation.
            history.series?.forEach(s => s.data.forEach(d => allValues.push(d.market_value || 0)));
            // Fallback if no series? Use portfolio? Or just 100.
            if (allValues.length === 0) allValues.push(100);
        } else {
            history.portfolio.forEach(d => allValues.push(d.value));
            history.series?.forEach(s => s.data.forEach(d => allValues.push(d.value)));
        }

        if (allValues.length === 0) return { yMinLimit: 0, yMaxLimit: 100 };

        const min = Math.floor(Math.min(...allValues));
        const max = Math.ceil(Math.max(...allValues));

        // Add padding
        const padding = Math.max(10, Math.abs(max - min) * 0.1);

        if (viewMode === 'value') {
            // Force 0 min for value mode as requested
            // And slider controls Portfolio Max.
            // Max limit should be enough to cover the max portfolio value.
            return {
                yMinLimit: 0,
                yMaxLimit: Math.ceil(max + padding)
            };
        }

        return {
            yMinLimit: Math.floor(min - padding),
            yMaxLimit: Math.ceil(max + padding)
        };
    }, [history, viewMode]);

    // 2. Initialize ranges when data loads
    useEffect(() => {
        if (rawChartData.length > 0 && !initializedRef.current) {
            // Restore Time Window
            if (initialSettings?.timeWindow !== undefined && initialSettings.timeWindow >= 0) {
                const maxIdx = rawChartData.length - 1;
                const start = Math.min(Math.max(0, initialSettings.timeWindow), maxIdx);
                setDateRange([start, maxIdx]);
            } else {
                setDateRange([0, rawChartData.length - 1]);
            }

            // Restore Y-Ranges
            if (initialSettings) {
                if (initialSettings.mwr) {
                    setMwrRange([initialSettings.mwr.yMin, initialSettings.mwr.yMax]);
                } else if (initialSettings.yAxisScale) {
                    setMwrRange([-50, initialSettings.yAxisScale]);
                }

                if (initialSettings.value) {
                    // Force 0 start for value mode restoration
                    setValueRange([0, initialSettings.value.yMax]);
                }
            }

            initializedRef.current = true;
        }
    }, [rawChartData.length, initialSettings]);

    // Initialize Y range when data loads or view mode changes
    useEffect(() => {
        if (viewMode === 'value') {
            // Always ensure min is 0
            if (valueRange[0] !== 0 || (valueRange[1] === 100 && yMaxLimit !== 100)) {
                setValueRange([0, yMaxLimit]);
            }
        }
        if (viewMode === 'mwr' && mwrRange[0] === 0 && mwrRange[1] === 100 && !initialSettings?.mwr && !initialSettings?.yAxisScale) {
            setMwrRange([yMinLimit, yMaxLimit]);
        }
    }, [yMinLimit, yMaxLimit, viewMode]);

    // Effect to notify settings change
    useEffect(() => {
        if (onSettingsChange && initializedRef.current) {
            const timer = setTimeout(() => {
                onSettingsChange({
                    timeWindow: dateRange[0],
                    mwr: { yMin: mwrRange[0], yMax: mwrRange[1] },
                    value: { yMin: valueRange[0], yMax: valueRange[1] },
                    yAxisScale: mwrRange[1]
                });
            }, 1000);

            return () => clearTimeout(timer);
        }
    }, [dateRange, mwrRange, valueRange]);

    // 3. Filter data
    const chartData = useMemo(() => {
        if (rawChartData.length === 0) return [];
        const [start, end] = dateRange;
        const safeStart = Math.max(0, start);
        const safeEnd = Math.min(rawChartData.length - 1, end);
        if (safeStart > safeEnd) return [];
        return rawChartData.slice(safeStart, safeEnd + 1);
    }, [rawChartData, dateRange]);

    // Compute tick values for Y-axis (major and minor)
    // For MWR mode: Uses generic logic
    // For Value mode: Logic applies to the RIGHT axis (Portfolio)
    // --- LEFT AXIS TICKS (Controlled by Slider) ---
    const { majorTicks, minorTicks, allTicks, majorStep } = useMemo(() => {
        const [min, max] = yRange;
        const range = Math.abs(max - min);
        const validRange = range === 0 ? 100 : range;

        const targetTickCount = 8;
        const rawStep = validRange / targetTickCount;

        const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
        const baseStep = rawStep / magnitude;

        let niceStep;
        if (baseStep > 5) niceStep = 10 * magnitude;
        else if (baseStep > 2) niceStep = 5 * magnitude;
        else if (baseStep > 1) niceStep = 2 * magnitude;
        else niceStep = 1 * magnitude;

        const majorStep = niceStep;
        const minorStep = majorStep / 2;

        const majorTicks: number[] = [];
        const minorTicks: number[] = [];

        const startMajor = Math.floor(min / majorStep) * majorStep;
        let current = startMajor;
        let safety = 0;

        while (current <= max + majorStep && safety < 1000) {
            if (current >= min && current <= max) {
                majorTicks.push(current);
            }
            current += majorStep;
            safety++;
        }

        if (showMinorGrid && viewMode !== 'value') {
            const startMinor = Math.floor(min / minorStep) * minorStep;
            current = startMinor;
            safety = 0;
            while (current <= max + minorStep && safety < 2000) {
                const isMajor = majorTicks.some(m => Math.abs(m - current) < (majorStep / 100));
                if (current >= min && current <= max && !isMajor) {
                    minorTicks.push(current);
                }
                current += minorStep;
                safety++;
            }
        }

        const allTicks = [...majorTicks, ...minorTicks].sort((a, b) => a - b);
        return { majorTicks, minorTicks, allTicks, majorStep };
    }, [yRange, showMinorGrid, viewMode]);



    // Calculate Portfolio Max for Right Axis
    // This is needed for the custom gridlines and axis scaling in Value mode
    const portfolioMax = useMemo(() => {
        if (!history || !history.portfolio || history.portfolio.length === 0) return 100;

        if (viewMode === 'value') {
            const maxVal = Math.max(...history.portfolio.map(d => d.market_value || 0));
            // Add padding (5%)
            return maxVal > 0 ? maxVal * 1.05 : 100;
        }
        // Fallback for types or generic usage
        return 100;
    }, [history, viewMode]);

    // --- RIGHT AXIS TICKS (Portfolio, Static/Auto based on Max) ---
    const rightAxisTicks = useMemo(() => {
        if (viewMode !== 'value') return [];

        // Like standard calculation but for 0 -> portfolioMax
        const min = 0;
        const max = portfolioMax;
        const range = max;
        const validRange = range === 0 ? 100 : range;

        const targetTickCount = 8;
        const rawStep = validRange / targetTickCount;
        const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
        const baseStep = rawStep / magnitude;

        let niceStep;
        if (baseStep > 5) niceStep = 10 * magnitude;
        else if (baseStep > 2) niceStep = 5 * magnitude;
        else if (baseStep > 1) niceStep = 2 * magnitude;
        else niceStep = 1 * magnitude;

        const ticks: number[] = [];
        let current = 0;
        let safety = 0;
        while (current <= max + niceStep && safety < 1000) {
            if (current <= max) ticks.push(current);
            current += niceStep;
            safety++;
        }
        return ticks;
    }, [portfolioMax, viewMode]);


    // Custom tick component
    const CustomYAxisTick = ({ x, y, payload }: any) => {
        const value = payload.value;
        const isMajor = majorTicks.includes(value);
        const isZero = value === 0;
        const isPositive = value > 0;

        // Color logic
        let color = '#94a3b8'; // default slate-400
        if (viewMode === 'mwr') {
            color = isZero ? '#ffffff' : isPositive ? '#22c55e' : '#ef4444';
        }

        const label = viewMode === 'value'
            ? `€${formatSwissNumber(value / 1000, 0)}k`
            : (isPositive ? `+${value}%` : `${value}%`);

        const valStr = viewMode === 'value'
            ? `€${formatSwissMoney(value, 0)}`
            : label;

        return (
            <text
                x={x}
                y={y}
                dy={4}
                textAnchor={viewMode === 'value' ? "end" : "end"}
                fill={color}
                fontSize={isMajor ? 12 : 10}
                fontWeight={isZero ? 'bold' : 'normal'}
                opacity={isMajor ? 1 : 0.7}
            >
                {valStr}
            </text>
        );
    };


    if (!history || !history.portfolio) {
        return <div className="p-4 text-center text-muted-foreground">Caricamento grafico...</div>
    }

    return (
        <div className="grid gap-4 md:grid-cols-1 mt-4">
            <Card className="bg-card/80 backdrop-blur-xl border-white/40 shadow-lg px-6 pt-6 transition-all duration-300">
                <CardHeader className="px-0 pt-0 pb-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-2">
                                <CardTitle className="text-xl font-medium tracking-tight">
                                    {viewMode === 'value' ? `Andamento Controvalore` : `Andamento MWR`} - {portfolioName || 'Portafoglio'}
                                </CardTitle>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                {viewMode === 'value' ? 'Valore di mercato del portafoglio e dei singoli asset' : 'Performance Money-Weighted per asset e portafoglio'}
                            </p>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="view-mode-value"
                                    checked={viewMode === 'value'}
                                    onCheckedChange={handleViewModeChange}
                                    className="border-white/50"
                                    disabled={isPending}
                                />
                                <label htmlFor="view-mode-value" className={`text-xs text-muted-foreground cursor-pointer ${isPending ? 'opacity-50' : ''}`}>
                                    Controvalore (€)
                                </label>
                            </div>
                            <div className="h-4 w-[1px] bg-white/10 mx-2"></div>
                            {/* Hide Grid controls in Value mode as we enforce specific grids? 
                                 Or just keep them effectively disabled/overridden?
                                 User said "gridlines... devono essere sempre solo le major".
                                 So we might want to disable the Minor checkbox or hide it. */}
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="major-grid"
                                    checked={showMajorGrid}
                                    onCheckedChange={(checked) => setShowMajorGrid(checked === true)}
                                    className="border-white/50 disabled:opacity-50"
                                    disabled={viewMode === 'value'} // Forced ON for Value mode mostly
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
                                    className="border-white/50 disabled:opacity-50"
                                    disabled={viewMode === 'value'} // Forced OFF for Value mode
                                />
                                <label htmlFor="minor-grid" className="text-xs text-muted-foreground cursor-pointer">
                                    Minor Grid
                                </label>
                            </div>
                        </div>
                    </div>
                </CardHeader>

                {/* Chart area with Y-axis slider on the left */}
                <div
                    className={`flex items-stretch transition-opacity duration-200 ${isPending ? 'opacity-50 cursor-wait' : 'opacity-100'}`}
                >
                    {/* Y-Axis Slider (Vertical) */}
                    {/* In Value Mode, this slider controls the Right Axis (Portfolio). 
                        It might be more intuitive to move it to the RIGHT side? 
                        But User asked for existing behavior modification. 
                        "lo slider verticale dovrebbe quindi poter essere attivo solo per la parte superiore"
                        Let's keep it left for now to avoid layout shift unless requested. 
                    */}
                    <div className="flex flex-col items-center justify-between pr-3 py-2" style={{ height: '450px' }}>
                        <span className="text-xs text-muted-foreground writing-mode-vertical">
                            {viewMode === 'value' ? `€${formatSwissNumber(yRange[1], 0)}` : `${yRange[1]}%`}
                        </span>
                        <RangeSlider
                            min={yMinLimit}
                            max={yMaxLimit}
                            step={viewMode === 'value' ? 100 : 1}
                            value={yRange}
                            onValueChange={setYRange}
                            orientation="vertical"
                            className="h-[380px]"
                            disabledLower={viewMode === 'value'}
                        />
                        <span className="text-xs text-muted-foreground writing-mode-vertical">
                            {viewMode === 'value' ? `€${formatSwissNumber(yRange[0], 0)}` : `${yRange[0]}%`}
                        </span>
                    </div>

                    {/* Chart */}
                    <CardContent className="p-0 h-[450px] flex-1">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                                data={chartData}
                                margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
                            >
                                {/* 
                                    GRIDLINES LOGIC 
                                    1. Standard (Left Axis): Controlled by Checkboxes. Visible in ALL modes.
                                    2. Custom (Right Axis): Visible ONLY in Value mode. Only Major.
                                */}
                                {showMajorGrid && (
                                    <CartesianGrid

                                        strokeDasharray="0"
                                        stroke="#475569"
                                        opacity={0.5}
                                        vertical={false}
                                        horizontalCoordinatesGenerator={({ yAxis }) => {
                                            if (!yAxis) return [];
                                            return majorTicks.map(t => yAxis.scale(t));
                                        }}
                                    />
                                )}
                                {viewMode === 'value' && (
                                    // Custom Gridlines for Right Axis (Portfolio)
                                    rightAxisTicks.map(tick => (
                                        <ReferenceLine
                                            key={`custom-grid-right-${tick}`}
                                            y={tick}
                                            yAxisId="right"
                                            stroke="#818cf8"
                                            strokeOpacity={0.4}
                                            strokeDasharray="4 2"
                                        />
                                    ))
                                )}

                                {/* Minor Gridlines (MWR only) */}
                                {viewMode !== 'value' && showMinorGrid && minorTicks.map((tick) => (
                                    <ReferenceLine
                                        key={`minor-grid-${tick}`}
                                        y={tick}
                                        yAxisId="left"
                                        stroke="#64748b"
                                        strokeDasharray="4 6"
                                        strokeOpacity={0.6}
                                    />
                                ))}

                                {/* Zero line */}
                                <ReferenceLine
                                    y={0}
                                    yAxisId={viewMode === 'value' ? 'right' : 'left'}
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

                                {/* PRIMARY Y-AXIS (Left) 
                                    MWR: Controls everything.
                                    Value: Controls ASSETS only. Auto scaled.
                                */}
                                <YAxis
                                    yAxisId="left"
                                    orientation="left"
                                    stroke="#94a3b8"
                                    tickLine={false}
                                    axisLine={false}
                                    // In value mode, left axis is controlled by slider (yRange)
                                    domain={[yRange[0], yRange[1]]}
                                    allowDataOverflow={true}
                                    ticks={viewMode === 'value' ? majorTicks : allTicks}
                                    tick={viewMode === 'value'
                                        ? ({ x, y, payload }) => (
                                            <text x={x} y={y} dy={4} fill="#94a3b8" fontSize={10} textAnchor="end">
                                                {`€${(payload.value / 1000).toFixed(0)}k`}
                                            </text>
                                        )
                                        : <CustomYAxisTick />
                                    }
                                />

                                {/* SECONDARY Y-AXIS (Right) - Only for Value Mode */}
                                {viewMode === 'value' && (
                                    <YAxis
                                        yAxisId="right"
                                        orientation="right"
                                        stroke="#818cf8"
                                        tickLine={false}
                                        axisLine={false}
                                        domain={[0, portfolioMax]} // Fixed range based on data
                                        allowDataOverflow={true}
                                        ticks={rightAxisTicks} // Fixed ticks
                                        tick={({ x, y, payload }) => (
                                            <text x={x} y={y} dy={4} fill="#818cf8" fontSize={12} textAnchor="start" fontWeight="bold">
                                                {`€${formatSwissNumber(payload.value)}`}
                                            </text>
                                        )}
                                    />
                                )}

                                <Tooltip
                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc', borderRadius: '8px' }}
                                    itemStyle={{ padding: 0 }}
                                    formatter={(value: number, name: string, props: any) => {
                                        const pnl = props.payload[`${name}_pnl`];
                                        const pnlStr = pnl !== undefined ? ` \n(P&L: ${pnl > 0 ? '+' : ''}€${formatSwissMoney(pnl)})` : '';
                                        const valStr = viewMode === 'value'
                                            ? `€${formatSwissMoney(value)}`
                                            : `${value.toFixed(2)}%`;
                                        return [`${valStr}${pnlStr}`, name];
                                    }}
                                    labelFormatter={(label) => new Date(label).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                                />

                                {/* Portfolio Line */}
                                <Line
                                    yAxisId={viewMode === 'value' ? "right" : "left"}
                                    type="monotone"
                                    dataKey="Portfolio"
                                    stroke="#ffffff"
                                    strokeWidth={3}
                                    dot={false}
                                    activeDot={{ r: 6 }}
                                    name="Portafoglio Totale"
                                />

                                {/* Asset Lines */}
                                {history.series?.map((s, idx) => {
                                    const displayName = `${s.name} (${s.isin})`;
                                    return (
                                        <Line
                                            key={s.isin}
                                            yAxisId="left" // Always on Left
                                            type="monotone"
                                            dataKey={displayName}
                                            stroke={s.color || COLORS[idx % COLORS.length]}
                                            strokeWidth={1.5}
                                            dot={false}
                                            strokeOpacity={0.8}
                                            name={displayName}
                                        />
                                    );
                                })}
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
