'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, Tooltip, Legend, LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine } from 'recharts';
import { formatSwissMoney, formatSwissNumber, parseISODateLocal, getAccessibleColor } from "@/lib/utils";

import { CHART_STRINGS } from "@/constants/chartStrings";


import { Button } from "@/components/ui/button";
import { Calculator, RefreshCcw, AlertTriangle } from "lucide-react";

const COLORS = ['#0ea5e9', '#22c55e', '#eab308', '#f97316', '#a855f7', '#ec4899', '#6366f1', '#14b8a6'];

interface DashboardChartsProps {
    allocationData: { name: string; value: number; sector: string; color?: string }[];
    history: {
        series: { isin: string; name: string; color?: string; data: { date: string; value: number; pnl?: number, market_value?: number }[] }[];
        portfolio: { date: string; value: number, market_value?: number, pnl?: number }[];
    };
    initialSettings?: {
        timeWindow?: number;
        timeWindowStart?: string;
        timeWindowEnd?: string;
        mwr?: { yMin: number, yMax: number };
        value?: { yMin: number, yMax: number };
        // Legacy support
        yAxisScale?: number;
        showMajorGrid?: boolean;
        showMinorGrid?: boolean;
        viewMode?: 'mwr' | 'value';
    };
    onSettingsChange?: (settings: any) => void;
    portfolioName?: string;
    hidePortfolio?: boolean;
    className?: string;
    onVisibleStatsChange?: (stats: { pnl: number; mwr: number; market_value: number; date: string; startDate?: string; isFullRange: boolean }) => void;
    mwrMode?: 'xirr' | 'simple_return' | 'mixed';
    xirrMode?: string;
    onXirrModeChange?: (mode: string) => void;
}

import { useState, useMemo, useEffect, useRef, useTransition } from "react";
import { RangeSlider } from "@/components/ui/range-slider";
import { Checkbox } from "@/components/ui/checkbox";

export function DashboardCharts({ allocationData, history, initialSettings, onSettingsChange, portfolioName, hidePortfolio, className, onVisibleStatsChange, mwrMode, xirrMode, onXirrModeChange }: DashboardChartsProps) {
    const [dateRange, setDateRange] = useState<number[]>([0, 0]);
    // Separate state for ranges
    const [mwrRange, setMwrRange] = useState<number[]>([0, 100]);
    const [valueRange, setValueRange] = useState<number[]>([0, 100]);

    // View Mode
    const [viewMode, setViewMode] = useState<'mwr' | 'value'>('mwr');
    const [isPending, startTransition] = useTransition();

    // Handler for viewing mode change
    const handleViewModeChange = (checked: boolean) => {
        setViewMode(checked ? 'value' : 'mwr');
    };

    // Tracking render time


    // Helper to get current range based on mode
    const yRange = viewMode === 'mwr' ? mwrRange : valueRange;
    const setYRange = (val: number[]) => {
        const start = performance.now();
        if (viewMode === 'mwr') {
            setMwrRange(val);
        } else {
            // Allow both ends to be adjusted in value mode
            setValueRange(val);
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
        const portfolioMap = new Map<string, { value: number, market_value: number, pnl: number }>();
        history.portfolio.forEach(d => {
            allDates.add(d.date);
            portfolioMap.set(d.date, { value: d.value, market_value: d.market_value || 0, pnl: d.pnl || 0 });
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

        // Single pass initial construction
        const initialData = sortedDates.map((date) => {
            const parsedDate = parseISODateLocal(date);
            const timestamp = parsedDate ? parsedDate.getTime() : 0;
            const item: any = { date, timestamp };

            const portVal = portfolioMap.get(date);
            if (portVal) {
                item.Portfolio = viewMode === 'value' ? portVal.market_value : portVal.value;
                item["Portafoglio Totale_pnl"] = (portVal as any).pnl ?? 0;
                item["Portfolio_raw_mv"] = portVal.market_value;
                item["Portfolio_raw_mwr"] = portVal.value;
            } else {
                item.Portfolio = null;
                item["Portafoglio Totale_pnl"] = null;
                item["Portfolio_raw_mv"] = null;
                item["Portfolio_raw_mwr"] = null;
            }

            history.series?.forEach(s => {
                const sMap = seriesMaps.get(s.isin);
                const val = sMap?.get(date);
                const displayName = `${s.name} (${s.isin})`;

                if (val) {
                    item[displayName] = viewMode === 'value' ? val.market_value : val.value;
                    item[`${displayName}_pnl`] = val.pnl;
                    item[`${displayName}_raw_mwr`] = val.value;
                    item[`${displayName}_raw_mv`] = val.market_value;
                } else {
                    item[displayName] = null;
                    item[`${displayName}_pnl`] = null;
                    item[`${displayName}_raw_mwr`] = null;
                    item[`${displayName}_raw_mv`] = null;
                }
            });
            return item;
        });

        // 2nd pass: Linear Interpolation for MISSING values
        // This ensures Tooltip shows data for all series even if they have "holes"
        const keysToInterpolate = ["Portfolio", ...(history.series?.map(s => `${s.name} (${s.isin})`) || [])];

        keysToInterpolate.forEach(key => {
            let lastValidIdx = -1;
            for (let i = 0; i < initialData.length; i++) {
                if (initialData[i][key] !== null) {
                    if (lastValidIdx !== -1 && i - lastValidIdx > 1) {
                        // We found a gap! Fill it.
                        const startVal = initialData[lastValidIdx][key];
                        const endVal = initialData[i][key];
                        const count = i - lastValidIdx;
                        const step = (endVal - startVal) / count;

                        // Also handle PnL and Raw values for callbacks
                        const pnlKey = `${key}_pnl`;
                        const startPnl = initialData[lastValidIdx][pnlKey] || 0;
                        const endPnl = initialData[i][pnlKey] || 0;
                        const pnlStep = (endPnl - startPnl) / count;

                        for (let j = lastValidIdx + 1; j < i; j++) {
                            const offset = j - lastValidIdx;
                            initialData[j][key] = startVal + (step * offset);
                            initialData[j][pnlKey] = startPnl + (pnlStep * offset);

                            // Callback raw data (mv/mwr)
                            const mvKey = `${key}_raw_mv`;
                            const mwrKey = `${key}_raw_mwr`;
                            if (initialData[lastValidIdx][mvKey] !== undefined) {
                                const sMv = initialData[lastValidIdx][mvKey] || 0;
                                const eMv = initialData[i][mvKey] || 0;
                                initialData[j][mvKey] = sMv + ((eMv - sMv) / count) * offset;
                            }
                            if (initialData[lastValidIdx][mwrKey] !== undefined) {
                                const sMwr = initialData[lastValidIdx][mwrKey] || 0;
                                const eMwr = initialData[i][mwrKey] || 0;
                                initialData[j][mwrKey] = sMwr + ((eMwr - sMwr) / count) * offset;
                            }
                        }
                    }
                    lastValidIdx = i;
                }
            }
        });

        return initialData;
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
        if (rawChartData.length > 0 && initialSettings !== null && !initializedRef.current) {
            // Restore Time Window
            const maxIdx = rawChartData.length - 1;
            
            if (initialSettings?.timeWindowStart && initialSettings?.timeWindowEnd) {
                // Find indices closest to saved dates
                let startIdx = 0;
                let endIdx = maxIdx;
                
                // Find start index
                const startMatch = rawChartData.findIndex(d => d.date >= initialSettings.timeWindowStart!);
                if (startMatch !== -1) startIdx = startMatch;
                
                // Find end index (reverse search for closest date <= timeWindowEnd)
                for (let i = maxIdx; i >= 0; i--) {
                    if (rawChartData[i].date <= initialSettings.timeWindowEnd!) {
                        endIdx = i;
                        break;
                    }
                }
                
                // Ensure valid range
                if (startIdx > endIdx) startIdx = endIdx;
                
                setDateRange([startIdx, endIdx]);
            } else if (initialSettings?.timeWindow !== undefined && initialSettings.timeWindow >= 0) {
                // Legacy fallback: Use index for start, default to max for end
                const start = Math.min(Math.max(0, initialSettings.timeWindow), maxIdx);
                setDateRange([start, maxIdx]);
            } else {
                // Default: Full range
                setDateRange([0, maxIdx]);
            }

            // Restore Y-Ranges
            if (initialSettings) {
                if (initialSettings.mwr && Math.abs(initialSettings.mwr.yMax) < 5000 && Math.abs(initialSettings.mwr.yMin) < 5000) {
                    setMwrRange([initialSettings.mwr.yMin, initialSettings.mwr.yMax]);
                } else if (initialSettings.yAxisScale && Math.abs(initialSettings.yAxisScale) < 5000) {
                    setMwrRange([-50, initialSettings.yAxisScale]);
                }

                if (initialSettings.value) {
                    setValueRange([initialSettings.value.yMin, initialSettings.value.yMax]);
                }

                // Restore Grid Settings
                if (initialSettings.showMajorGrid !== undefined) {
                    setShowMajorGrid(initialSettings.showMajorGrid);
                }
                if (initialSettings.showMinorGrid !== undefined) {
                    setShowMinorGrid(initialSettings.showMinorGrid);
                }
                if (initialSettings.viewMode) {
                    setViewMode(initialSettings.viewMode);
                }
            }

            initializedRef.current = true;
        }
    }, [rawChartData.length, initialSettings]);

    // Initialize Y range when data loads or view mode changes
    useEffect(() => {
        if (viewMode === 'value') {
            // Initialize with reasonable range if not yet set
            if (valueRange[1] === 100 && yMaxLimit !== 100) {
                setValueRange([0, yMaxLimit]);
            }
        }
        if (viewMode === 'mwr' && mwrRange[0] === 0 && mwrRange[1] === 100 && !initialSettings?.mwr && !initialSettings?.yAxisScale) {
            setMwrRange([yMinLimit, yMaxLimit]);
        }
    }, [yMinLimit, yMaxLimit, viewMode]);

    // Explicit Settings Commit Helper
    const commitSettings = (partials: {
        dateRange?: number[],
        mwrRange?: number[],
        valueRange?: number[],
        showMajorGrid?: boolean,
        showMinorGrid?: boolean,
        viewMode?: 'mwr' | 'value'
    } = {}) => {
        if (!onSettingsChange || !initializedRef.current) return;

        const effectiveDateRange = partials.dateRange || dateRange;
        const effectiveMwrRange = partials.mwrRange || mwrRange;
        const effectiveValueRange = partials.valueRange || valueRange;
        
        const settingsPayload = {
            timeWindow: effectiveDateRange[0], // Keep for backward compatibility 
            timeWindowStart: rawChartData[effectiveDateRange[0]]?.date,
            timeWindowEnd: rawChartData[effectiveDateRange[1]]?.date,
            mwr: { yMin: effectiveMwrRange[0], yMax: effectiveMwrRange[1] },
            value: { yMin: effectiveValueRange[0], yMax: effectiveValueRange[1] },
            yAxisScale: effectiveMwrRange[1],
            showMajorGrid: partials.showMajorGrid !== undefined ? partials.showMajorGrid : showMajorGrid,
            showMinorGrid: partials.showMinorGrid !== undefined ? partials.showMinorGrid : showMinorGrid,
            viewMode: partials.viewMode || viewMode
        };

        onSettingsChange(settingsPayload);
    };
    
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
        if (viewMode === 'mwr') return majorTicks;

        // Like standard calculation but for 0 -> portfolioMax
        const min = 0;
        const max = portfolioMax;
        const range = max;
        // ... rest of logic for value mode
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
    }, [portfolioMax, viewMode, majorTicks]);


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


    // [FIX] Removed conditional return to satisfy Rules of Hooks
    // If !history, we still run hooks but render loading state at the end.

    // Callback for visible stats
    useEffect(() => {
        if (!onVisibleStatsChange || rawChartData.length === 0) return;

        const startIndex = dateRange[0];
        const endIndex = dateRange[1];

        // Determine if we are showing the full available range
        const isFullRange = startIndex === 0 && endIndex === rawChartData.length - 1;

        const startPoint = rawChartData[startIndex];
        const endPoint = rawChartData[endIndex];

        if (startPoint && endPoint) {
            let endPnl = 0, endMv = 0, startPnl = 0, startMv = 0, backendMwr = 0;

            if (hidePortfolio && history?.series && history.series.length > 0) {
                // Asset Context: use the first series
                const s = history.series[0];
                const displayName = `${s.name} (${s.isin})`;
                endPnl = endPoint[`${displayName}_pnl`] ?? 0;
                endMv = endPoint[`${displayName}_raw_mv`] ?? 0;
                startPnl = startPoint[`${displayName}_pnl`] ?? 0;
                startMv = startPoint[`${displayName}_raw_mv`] ?? 0;
                backendMwr = endPoint[`${displayName}_raw_mwr`] ?? 0;
            } else {
                // Dashboard Context: use global Portfolio
                endPnl = endPoint["Portafoglio Totale_pnl"] ?? 0;
                endMv = endPoint["Portfolio_raw_mv"] ?? 0;
                startPnl = startPoint["Portafoglio Totale_pnl"] ?? 0;
                startMv = startPoint["Portfolio_raw_mv"] ?? 0;
                backendMwr = endPoint["Portfolio_raw_mwr"] ?? 0;
            }

            // Calculate Delta PnL for the visible period
            const deltaPnl = endPnl - startPnl;

            // Calculate Period Return (Modified Dietz Approximation)
            const invStart = startMv - startPnl;
            const invEnd = endMv - endPnl;
            const netFlows = invEnd - invStart;
            const avgCapital = invStart + (netFlows / 2);

            let periodReturn = 0;
            if (avgCapital !== 0) {
                periodReturn = (deltaPnl / avgCapital) * 100;
            }

            // If we are at the very beginning, the backend MWR is exact
            let finalMwr = periodReturn;
            if (startIndex === 0 && backendMwr !== undefined) {
                finalMwr = backendMwr;
            }

            onVisibleStatsChange({
                pnl: deltaPnl,
                mwr: finalMwr,
                market_value: endMv,
                date: endPoint.date,
                startDate: startPoint.date,
                isFullRange
            });
        }
    }, [dateRange, rawChartData, history?.series, hidePortfolio, onVisibleStatsChange]);

    if (!history || !history.portfolio) {
        return <div className="p-4 text-center text-muted-foreground">Caricamento grafico...</div>
    }

    return (
        <div className={`grid gap-4 md:grid-cols-1 ${className || 'mt-4'}`}>
            <Card className="bg-card/80 backdrop-blur-xl border-white/40 shadow-lg px-6 pt-6 transition-all duration-300 flex flex-col h-full">
                <CardHeader className="px-0 pt-0 pb-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-2">
                                <CardTitle className="text-xl font-medium tracking-tight">
                                    {(() => {
                                        const contextStrings = hidePortfolio ? CHART_STRINGS.asset : CHART_STRINGS.dashboard;
                                        const title = viewMode === 'value' ? contextStrings.value.title : contextStrings.mwr.title;
                                        return `${title} - ${portfolioName || 'Portafoglio'}`;
                                    })()}
                                    {(mwrMode === 'simple_return' || mwrMode === 'mixed') && (
                                        <span className="text-red-500 text-sm ml-2 font-normal whitespace-nowrap" title="Calcolo XIRR non convergente, usato Simple Return come fallback">(simple return)</span>
                                    )}
                                </CardTitle>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                {(() => {
                                    const contextStrings = hidePortfolio ? CHART_STRINGS.asset : CHART_STRINGS.dashboard;
                                    return viewMode === 'value' ? contextStrings.value.subtitle : contextStrings.mwr.subtitle;
                                })()}
                            </p>
                        </div>
                        <div className="flex items-center gap-4">
                            {onXirrModeChange && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className={`h-7 px-2 gap-1 text-xs ${xirrMode === 'multi_guess' ? 'bg-primary/20 border-primary text-primary' : 'text-muted-foreground'}`}
                                    onClick={() => {
                                        onXirrModeChange(xirrMode === 'multi_guess' ? 'standard' : 'multi_guess');
                                    }}
                                    title="Cambia metodo di calcolo XIRR (Standard vs Multi-Guess)"
                                >
                                    <Calculator className="h-3 w-3" />
                                    <span className="hidden sm:inline">
                                        {xirrMode === 'multi_guess' ? 'Multi-Guess' : 'Standard'}
                                    </span>
                                </Button>
                            )}
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="view-mode-value"
                                    checked={viewMode === 'value'}
                                    onCheckedChange={(checked) => {
                                        handleViewModeChange(checked as boolean);
                                        commitSettings({ viewMode: checked ? 'value' : 'mwr' });
                                    }}
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
                                    onCheckedChange={(checked) => {
                                        setShowMajorGrid(checked === true);
                                        commitSettings({ showMajorGrid: checked === true });
                                    }}
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
                                    onCheckedChange={(checked) => {
                                        setShowMinorGrid(checked === true);
                                        commitSettings({ showMinorGrid: checked === true });
                                    }}
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
                    className={`flex items-stretch transition-opacity duration-200 flex-1 min-h-0 ${isPending ? 'opacity-50 cursor-wait' : 'opacity-100'}`}
                >
                    {/* Y-Axis Slider (Vertical) */}
                    {/* In Value Mode, this slider controls the Right Axis (Portfolio). 
                        It might be more intuitive to move it to the RIGHT side? 
                        But User asked for existing behavior modification. 
                        "lo slider verticale dovrebbe quindi poter essere attivo solo per la parte superiore"
                        Let's keep it left for now to avoid layout shift unless requested. 
                    */}
                    <div className="flex flex-col items-center justify-between pr-3 py-2 h-full">
                        <span className="text-xs text-muted-foreground writing-mode-vertical">
                            {viewMode === 'value' ? `€${formatSwissNumber(yRange[1], 0)}` : `${yRange[1]}%`}
                        </span>
                        <RangeSlider
                            min={yMinLimit}
                            max={yMaxLimit}
                            step={viewMode === 'value' ? 100 : 1}
                            value={yRange}
                            onValueChange={(val) => {
                                setYRange(val);
                            }}
                            onValueCommit={(val) => {
                                if (viewMode === 'value') {
                                    commitSettings({ valueRange: val });
                                } else {
                                    commitSettings({ mwrRange: val });
                                }
                            }}
                            orientation="vertical"
                            className="h-[85%]"
                        />
                        <span className="text-xs text-muted-foreground writing-mode-vertical">
                            {viewMode === 'value' ? `€${formatSwissNumber(yRange[0], 0)}` : `${yRange[0]}%`}
                        </span>
                    </div>

                    {/* Chart */}
                    <CardContent className="p-0 flex-1 h-full min-h-0">
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
                                        vertical={true}
                                        horizontalCoordinatesGenerator={({ yAxis }) => {
                                            if (!yAxis) return [];
                                            return majorTicks.map(t => yAxis.scale(t));
                                        }}
                                    />
                                )}

                                {/* Gridlines Asse Destro (Portfolio) - Tratteggiate Ambra Tenue - ONLY IN VALUE MODE */}
                                {viewMode === 'value' && showMajorGrid && !hidePortfolio && rightAxisTicks.map((tick) => (
                                    <ReferenceLine
                                        key={`right-grid-${tick}`}
                                        y={tick}
                                        yAxisId="right"
                                        stroke="#fbbf24"
                                        strokeDasharray="5 5"
                                        strokeOpacity={0.4}
                                        strokeWidth={1.5}
                                    />
                                ))}


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
                                    yAxisId="left"
                                    stroke="#ffffff"
                                    strokeWidth={2}
                                    strokeOpacity={0.8}
                                />

                                <XAxis
                                    dataKey="timestamp"
                                    type="number"
                                    domain={['dataMin', 'dataMax']}
                                    scale="time"
                                    stroke="#94a3b8"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(val) => {
                                        const d = parseISODateLocal(val);
                                        return d ? d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
                                    }}
                                    dy={10}
                                    angle={-45}
                                    textAnchor="end"
                                    height={60}
                                />

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
                                        ? ({ x, y, payload }: any) => {
                                            const val = payload.value;
                                            let label = `€${formatSwissNumber(val, 0)}`;
                                            if (val >= 1000) {
                                                label = `€${formatSwissNumber(val / 1000, 0)}k`;
                                            }
                                            if (val === 0) label = "€0";
                                            return (
                                                <text x={x} y={y} dy={4} fill="#94a3b8" fontSize={10} textAnchor="end">
                                                    {label}
                                                </text>
                                            );
                                        }
                                        : <CustomYAxisTick />
                                    }
                                />

                                {!hidePortfolio && viewMode === 'value' && (
                                    <YAxis
                                        yAxisId="right"
                                        orientation="right"
                                        stroke="#ffffff"
                                        tickLine={false}
                                        axisLine={false}
                                        domain={[0, portfolioMax]}
                                        ticks={rightAxisTicks}
                                        tick={({ x, y, payload }: any) => {
                                            const val = payload.value;
                                            let label = (val >= 1000 ? `€${formatSwissNumber(val / 1000, 0)}k` : `€${formatSwissNumber(val, 0)}`);

                                            if (val === 0) label = "€0";

                                            return (
                                                <text x={x} y={y} dy={4} fill="#ffffff" fontSize={10} textAnchor="start">
                                                    {label}
                                                </text>
                                            );
                                        }}
                                    />
                                )}

                                <Tooltip
                                    shared={true}
                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc', borderRadius: '8px' }}
                                    itemStyle={{ padding: 0 }}
                                    formatter={(value: number, name: string, props: any) => {
                                        if (value === null || value === undefined) return ["-", name];

                                        const pnl = props.payload[`${name}_pnl`];
                                        const pnlStr = pnl !== null && pnl !== undefined ? ` (P&L: ${pnl > 0 ? '+' : ''}€${formatSwissMoney(pnl)})` : '';
                                        const valStr = viewMode === 'value'
                                            ? `€${formatSwissMoney(value)}`
                                            : `${value.toFixed(2)}%`;
                                        return [`${valStr}${pnlStr}`, name];
                                    }}
                                    itemSorter={(item) => {
                                        const val = item.value;
                                        // Sort descending by value
                                        if (val === null || val === undefined) return Infinity;
                                        // Use negative value for ascending sort function to achieve descending order
                                        // But wait, Recharts itemSorter default is likely: (a, b) => ... ? No, type definition says:
                                        // `itemSorter?: (item: Payload<TValue, TName>) => number | string;`
                                        // And Recharts sorts based on the return value of this function.
                                        // Standard sort is usually ascending. So higher values should return smaller numbers to be first? 
                                        // Actually simplest way: return -val to sort descending if sort is ascending.
                                        // Let's assume standard ascending sort on the key returned.
                                        return typeof val === 'number' ? -val : 0;
                                    }}
                                    labelFormatter={(label) => {
                                        const d = parseISODateLocal(label);
                                        return d ? d.toLocaleDateString('it-IT', { dateStyle: 'medium' }) : '';
                                    }}
                                />

                                {/* Portfolio Line - On Right Axis in Value mode, Left Axis in MWR mode */}
                                {!hidePortfolio && (
                                    <Line
                                        yAxisId={viewMode === 'value' ? "right" : "left"}
                                        type="monotone"
                                        dataKey="Portfolio"
                                        stroke="#ffffff"
                                        strokeWidth={3}
                                        dot={false}
                                        activeDot={{ r: 6 }}
                                        name="Portafoglio Totale"
                                        connectNulls={true}
                                    />
                                )}

                                {/* Asset Lines */}
                                {history.series?.map((s, idx) => {
                                    const displayName = `${s.name} (${s.isin})`;
                                    const rawColor = s.color || COLORS[idx % COLORS.length];
                                    const accessibleColor = getAccessibleColor(rawColor, 60); // Ensure min 60% lightness

                                    return (
                                        <Line
                                            key={s.isin}
                                            yAxisId="left" // Always on Left
                                            type="monotone"
                                            dataKey={displayName}
                                            stroke={accessibleColor}
                                            strokeWidth={1.5}
                                            dot={false}
                                            strokeOpacity={0.8}
                                            name={displayName}
                                            connectNulls={true}
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
                        <span>{rawChartData.length > 0 ? (parseISODateLocal(rawChartData[dateRange[0]]?.date)?.toLocaleDateString() || '') : ''}</span>
                        <span>Filtro Temporale</span>
                        <span>{rawChartData.length > 0 ? (parseISODateLocal(rawChartData[dateRange[1]]?.date || rawChartData[rawChartData.length - 1].date)?.toLocaleDateString() || '') : ''}</span>
                    </div>
                    <RangeSlider
                        min={0}
                        max={Math.max(0, rawChartData.length - 1)}
                        step={1}
                        value={dateRange}
                        onValueChange={(val) => {
                            setDateRange(val);
                        }}
                        onValueCommit={(val) => {
                            commitSettings({ dateRange: val });
                        }}
                        className="w-full"
                    />
                </div>
            </Card>
        </div>
    );
}
