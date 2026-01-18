'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

interface DashboardChartsProps {
    allocationData: { name: string; value: number; sector: string }[];
}

export function DashboardCharts({ allocationData }: DashboardChartsProps) {

    // Group by sector for cleaner pie chart
    const sectorDataMap: { [key: string]: number } = {};
    allocationData.forEach(item => {
        const sector = item.sector || "Other";
        sectorDataMap[sector] = (sectorDataMap[sector] || 0) + item.value;
    });

    const sectorData = Object.keys(sectorDataMap).map(key => ({
        name: key,
        value: sectorDataMap[key]
    })).sort((a, b) => b.value - a.value);

    // Mock history data for now (since backend endpoint isn't ready for history yet)
    // We will update this later.
    const mockHistoryData = [
        { date: '2023-01', value: 10000, invested: 10000 },
        { date: '2023-04', value: 12500, invested: 11000 },
        { date: '2023-08', value: 14200, invested: 13000 },
        { date: '2023-12', value: 16800, invested: 15000 },
        { date: '2024-01', value: 16500, invested: 15000 },
    ];

    return (
        <div className="grid gap-4 md:grid-cols-2 mt-4">
            {/* Allocation Chart */}
            <Card className="bg-white/5 border-white/10 backdrop-blur-sm col-span-1">
                <CardHeader>
                    <CardTitle className="text-slate-200">Allocazione per Settore</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={sectorData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    outerRadius={100}
                                    fill="#8884d8"
                                    dataKey="value"
                                >
                                    {sectorData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    formatter={(value: any) => `€ ${(value || 0).toLocaleString('it-IT', { minimumFractionDigits: 0 })}`}
                                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#fff' }}
                                />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>

            {/* Performance Chart Placeholder */}
            <Card className="bg-white/5 border-white/10 backdrop-blur-sm col-span-1">
                <CardHeader>
                    <CardTitle className="text-slate-200">Andamento Portafoglio (Simulato)</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                                data={mockHistoryData}
                                margin={{
                                    top: 5,
                                    right: 30,
                                    left: 20,
                                    bottom: 5,
                                }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis dataKey="date" stroke="#94a3b8" />
                                <YAxis stroke="#94a3b8" />
                                <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#fff' }} />
                                <Legend />
                                <Line type="monotone" dataKey="value" stroke="#8884d8" activeDot={{ r: 8 }} name="Valore Attuale" />
                                <Line type="monotone" dataKey="invested" stroke="#82ca9d" name="Capitale Investito" />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
