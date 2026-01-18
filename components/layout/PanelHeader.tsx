import React from 'react';
import { Separator } from "@/components/ui/separator"

interface PanelHeaderProps {
    title: string;
    breadcrumbs?: { label: string; href?: string }[];
}

export function PanelHeader({ title, breadcrumbs }: PanelHeaderProps) {
    return (
        <div className="flex flex-col gap-2 mb-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            </div>
            <Separator className="bg-border/40" />
        </div>
    );
}
