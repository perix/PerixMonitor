"use client"

import { TrendingUp } from "lucide-react"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"

import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import {
    ChartConfig,
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from "@/components/ui/chart"

const chartConfig = {
    value: {
        label: "Patrimonio",
        color: "hsl(var(--chart-1))",
    },
} satisfies ChartConfig

interface NetWorthChartProps {
    data: { date: string; value: number }[];
}

export function NetWorthChart({ data }: NetWorthChartProps) {
    // Logic to calculate percentage change
    const startValue = data.length > 0 ? data[0].value : 0;
    const endValue = data.length > 0 ? data[data.length - 1].value : 0;
    const percentageChange = startValue > 0 ? ((endValue - startValue) / startValue) * 100 : 0;
    const isPositive = percentageChange >= 0;

    return (
        <Card className="bg-card/50 backdrop-blur-md border border-white/10 shadow-xl">
            <CardHeader>
                <CardTitle className="text-xl font-serif tracking-wide">Patrimonio Netto</CardTitle>
                <CardDescription>Andamento storico</CardDescription>
            </CardHeader>
            <CardContent>
                <ChartContainer config={chartConfig}>
                    <AreaChart
                        accessibilityLayer
                        data={data}
                        margin={{
                            left: 12,
                            right: 12,
                        }}
                    >
                        <defs>
                            <linearGradient id="fillValue" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.8} />
                                <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0.1} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.2} />
                        <XAxis
                            dataKey="date"
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                            tickFormatter={(value) => {
                                try {
                                    const d = new Date(value);
                                    return d.toLocaleDateString('it-IT', { month: 'short', day: 'numeric' });
                                } catch { return value; }
                            }}
                            strokeOpacity={0.5}
                        />
                        <ChartTooltip
                            cursor={false}
                            content={<ChartTooltipContent indicator="dot" />}
                        />
                        <Area
                            dataKey="value"
                            type="natural"
                            fill="url(#fillValue)"
                            fillOpacity={0.4}
                            stroke="var(--color-value)"
                            stackId="a"
                        />
                    </AreaChart>
                </ChartContainer>
            </CardContent>
            <CardFooter>
                <div className="flex w-full items-start gap-2 text-sm">
                    <div className="grid gap-2">
                        <div className={`flex items-center gap-2 font-medium leading-none ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                            {isPositive ? '+' : ''}{percentageChange.toFixed(1)}% rispetto all'inizio <TrendingUp className={`h-4 w-4 ${!isPositive && 'rotate-180'}`} />
                        </div>
                        <div className="flex items-center gap-2 leading-none text-muted-foreground">
                            Dall'inizio delle rilevazioni
                        </div>
                    </div>
                </div>
            </CardFooter>
        </Card>
    )
}
