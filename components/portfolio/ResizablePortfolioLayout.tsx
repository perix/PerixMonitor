'use client';

import { ReactNode, useCallback, useEffect, useState } from 'react';
import { cn } from "@/lib/utils";

interface ResizablePortfolioLayoutProps {
    leftPanel: ReactNode;
    rightPanel: ReactNode;
    // Controlled Width
    widthPercent?: number;
    onWidthChange?: (width: number) => void;
    defaultLayout?: number[];
}

// const STORAGE_KEY = 'perix-portfolio-layout-v1'; -> Removed

export function ResizablePortfolioLayout({ leftPanel, rightPanel, widthPercent, onWidthChange, defaultLayout = [30, 70] }: ResizablePortfolioLayoutProps) {
    // V18: CONTROLLED COMPONENT
    // - Persisted by parent via onWidthChange

    // Internal state for dragging smoothness, seeded by prop
    const [leftWidth, setLeftWidth] = useState(widthPercent || defaultLayout[0]);
    const [isDragging, setIsDragging] = useState(false);
    const [mounted, setMounted] = useState(false);

    // Sync from prop if it changes (and not dragging)
    useEffect(() => {
        if (widthPercent && !isDragging) {
            setLeftWidth(widthPercent);
        }
    }, [widthPercent, isDragging]);

    useEffect(() => {
        setMounted(true);
    }, []);

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();

        const handle = e.currentTarget;
        handle.setPointerCapture(e.pointerId);
        setIsDragging(true);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!isDragging) return;
        e.preventDefault();

        const container = e.currentTarget.parentElement;
        if (!container) return;

        const containerRect = container.getBoundingClientRect();
        const relativeX = e.clientX - containerRect.left;

        let newWidthPercent = (relativeX / containerRect.width) * 100;

        // Clamp limits:
        // Min: 1% (requested by user)
        // Max: 80%
        newWidthPercent = Math.min(Math.max(newWidthPercent, 1), 80);

        requestAnimationFrame(() => {
            setLeftWidth(newWidthPercent);
        });
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
        e.currentTarget.releasePointerCapture(e.pointerId);

        // Notify parent of final width
        if (onWidthChange) {
            onWidthChange(leftWidth);
        }
    };

    if (!mounted) {
        // Render static default layout to prevent hydration mismatch
        return (
            <div className="w-full h-full flex flex-row overflow-hidden bg-background/50 isolate relative opacity-0">
                {/* Invisible pre-hydration state or we could render default */}
            </div>
        );
    }

    return (
        <div
            className="w-full h-full flex flex-row overflow-hidden bg-background/50 isolate relative"
            id="portfolio-layout-v17-final"
        >
            {/* Left Panel */}
            <div
                style={{ width: `${leftWidth}%` }}
                className={cn(
                    "h-full flex flex-col transition-none overflow-hidden", // Removed min-w-[200px]
                    isDragging && "select-none"
                )}
            >
                {isDragging && <div className="absolute inset-0 z-50 bg-transparent" />}
                {leftPanel}
            </div>

            {/* Handle */}
            <div
                className={cn(
                    "w-4 h-full shrink-0 z-50 touch-none",
                    "flex items-center justify-center cursor-col-resize group",
                    "hover:bg-accent/10 transition-colors",
                    isDragging && "bg-accent/20"
                )}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onPointerLeave={handlePointerUp}
            >
                <div
                    className={cn(
                        "w-1 h-12 rounded-full bg-border transition-all duration-200",
                        "group-hover:h-16 group-hover:bg-primary/50",
                        isDragging && "h-20 bg-primary shadow-[0_0_15px_rgba(var(--primary),0.6)]"
                    )}
                />
            </div>

            {/* Right Panel */}
            <div
                className={cn(
                    "flex-1 h-full min-w-0 flex flex-col transition-none overflow-hidden",
                    isDragging && "select-none"
                )}
            >
                {isDragging && <div className="absolute inset-0 z-50 bg-transparent" />}
                {rightPanel}
            </div>
        </div>
    );
}
