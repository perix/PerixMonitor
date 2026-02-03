'use client';

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AssetConfigPanel } from '@/components/settings/AssetConfigPanel';
import AiConfigPanel from '@/components/settings/AiConfigPanel';
import SystemMaintenancePanel from '@/components/settings/SystemMaintenancePanel';
import DevTestPanel from '@/components/settings/DevTestPanel';
import { createClient } from '@/utils/supabase/client';
import axios from 'axios';

export default function SettingsPage() {
    const supabase = createClient();
    const [logEnabled, setLogEnabled] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        const fetchLogConfig = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const res = await axios.get(`/api/settings/log-config?user_id=${user.id}`);
                    setLogEnabled(res.data.enabled || false);
                }
            } catch (error) {
                console.error("Failed to fetch log config", error);
            } finally {
                setLoading(false);
            }
        };
        fetchLogConfig();
    }, []);

    // Listen for log config changes from SystemMaintenancePanel
    useEffect(() => {
        const handleStorageChange = () => {
            // Re-fetch when log config might have changed
            const fetchLogConfig = async () => {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const res = await axios.get(`/api/settings/log-config?user_id=${user.id}`);
                    setLogEnabled(res.data.enabled || false);
                }
            };
            fetchLogConfig();
        };

        window.addEventListener('log-config-changed', handleStorageChange);
        return () => window.removeEventListener('log-config-changed', handleStorageChange);
    }, []);

    const gridCols = logEnabled ? 'grid-cols-4' : 'grid-cols-3';

    return (
        <div className="max-w-5xl lg:max-w-6xl xl:max-w-7xl mx-auto pb-20 px-4">
            <h1 className="text-3xl font-bold mb-6 text-white">Impostazioni</h1>
            <Tabs defaultValue="assets" className="space-y-6">
                <TabsList className={`grid w-full ${gridCols} bg-slate-900 border border-white/10 h-14 p-1 rounded-xl`}>
                    <TabsTrigger value="assets" className="rounded-lg data-[state=active]:bg-emerald-600 data-[state=active]:text-white h-full text-base">
                        Asset
                    </TabsTrigger>
                    <TabsTrigger value="ai" className="rounded-lg data-[state=active]:bg-indigo-600 data-[state=active]:text-white h-full text-base">
                        AI
                    </TabsTrigger>
                    <TabsTrigger value="system" className="rounded-lg data-[state=active]:bg-red-600 data-[state=active]:text-white h-full text-base">
                        Manutenzione
                    </TabsTrigger>
                    {logEnabled && (
                        <TabsTrigger value="devtest" className="rounded-lg data-[state=active]:bg-amber-600 data-[state=active]:text-white h-full text-base">
                            Dev Test
                        </TabsTrigger>
                    )}
                </TabsList>

                <TabsContent value="assets" className="focus-visible:outline-none">
                    <AssetConfigPanel />
                </TabsContent>

                <TabsContent value="ai" className="focus-visible:outline-none">
                    <AiConfigPanel />
                </TabsContent>

                <TabsContent value="system" className="focus-visible:outline-none">
                    <SystemMaintenancePanel />
                </TabsContent>

                {logEnabled && (
                    <TabsContent value="devtest" className="focus-visible:outline-none">
                        <DevTestPanel />
                    </TabsContent>
                )}
            </Tabs>
        </div>
    );

}
