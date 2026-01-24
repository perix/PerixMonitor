'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AiConfigPanel from '@/components/settings/AiConfigPanel';
import SystemMaintenancePanel from '@/components/settings/SystemMaintenancePanel';

export default function SettingsPage() {
    return (
        <div className="max-w-4xl mx-auto pb-20">
            <h1 className="text-3xl font-bold mb-6 text-white">Impostazioni</h1>
            <Tabs defaultValue="ai" className="space-y-6">
                <TabsList className="grid w-full grid-cols-2 bg-slate-900 border border-white/10 h-14 p-1 rounded-xl">
                    <TabsTrigger value="ai" className="rounded-lg data-[state=active]:bg-indigo-600 data-[state=active]:text-white h-full text-base">
                        Configurazione AI
                    </TabsTrigger>
                    <TabsTrigger value="system" className="rounded-lg data-[state=active]:bg-red-600 data-[state=active]:text-white h-full text-base">
                        Manutenzione
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="ai" className="focus-visible:outline-none">
                    <AiConfigPanel />
                </TabsContent>

                <TabsContent value="system" className="focus-visible:outline-none">
                    <SystemMaintenancePanel />
                </TabsContent>
            </Tabs>
        </div>
    );
}
