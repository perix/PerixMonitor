"use client"

import * as React from "react"
import { PieChart, Pie, Sector, Cell, ResponsiveContainer, Tooltip } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"


const renderActiveShape = (props: any) => {
    const { cx, cy, midAngle, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props;
    const sin = Math.sin(-RADIAN * midAngle);
    const cos = Math.cos(-RADIAN * midAngle);
    const sx = cx + (outerRadius + 10) * cos;
    const sy = cy + (outerRadius + 10) * sin;
    const mx = cx + (outerRadius + 30) * cos;
    const my = cy + (outerRadius + 30) * sin;
    const ex = mx + (cos >= 0 ? 1 : -1) * 22;
    const ey = my;
    const textAnchor = cos >= 0 ? 'start' : 'end';

    return (
        <g>
            <text x={cx} y={cy} dy={-10} textAnchor="middle" fill="#fff" className="text-2xl font-bold" filter="url(#glow)">
                {payload.name}
            </text>
            <text x={cx} y={cy} dy={25} textAnchor="middle" fill="#94a3b8" className="text-lg font-bold" filter="url(#glow)">
                {`${(percent * 100).toFixed(2)}%`}
            </text>
            <Sector
                cx={cx}
                cy={cy}
                innerRadius={innerRadius}
                outerRadius={outerRadius + 10}
                startAngle={startAngle}
                endAngle={endAngle}
                fill={fill}
                filter="url(#shadow)"
            />
            <Sector
                cx={cx}
                cy={cy}
                startAngle={startAngle}
                endAngle={endAngle}
                innerRadius={outerRadius + 15}
                outerRadius={outerRadius + 18}
                fill={fill}
            />
        </g>
    );
};

const RADIAN = Math.PI / 180;

interface DataItem {
    name: string;
    value: number;
    color?: string;
    [key: string]: any;
}

interface AnalysisPieChartProps {
    data: DataItem[];
    onSelect: (item: DataItem | null) => void;
    colors: string[]; // Pass explicit colors matched to data index or use data.color
}

export function AnalysisPieChart({ data, onSelect, colors }: AnalysisPieChartProps) {
    // Select largest slice by default
    const [activeIndex, setActiveIndex] = React.useState(0);

    const onPieEnter = (_: any, index: number) => {
        setActiveIndex(index);
        if (data[index]) {
            onSelect(data[index]);
        }
    };

    React.useEffect(() => {
        if (data.length > 0) {
            onSelect(data[0]);
        }
    }, [data]);

    return (
        <div className="w-full h-full flex justify-center items-center relative">
            <svg style={{ position: 'absolute', width: 0, height: 0 }}>
                <defs>
                    <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
                        <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="rgba(0,0,0,0.6)" />
                    </filter>
                    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="1" result="coloredBlur" />
                        <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>
            </svg>
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                        activeIndex={activeIndex}
                        activeShape={renderActiveShape}
                        data={data}
                        cx="40%"
                        cy="50%"
                        innerRadius="40%"
                        outerRadius="70%"
                        fill="#8884d8"
                        dataKey="value"
                        onMouseEnter={onPieEnter}
                        onClick={onPieEnter}
                        paddingAngle={2}
                        stroke="none"
                    >
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color || colors[index % colors.length]} />
                        ))}
                    </Pie>
                </PieChart>
            </ResponsiveContainer>
        </div>
    )
}
