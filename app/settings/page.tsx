'use client';

import SettingsPanel from '@/components/settings/SettingsPanel';

export default function SettingsPage() {
    return (
        <div className="space-y-6">

            <div className="flex flex-col gap-6">
                <SettingsPanel />
            </div>
        </div>
    );
}
