'use client';

import * as React from "react"
import {
    AudioWaveform,
    BookOpen,
    Bot,
    Command,
    Frame,
    GalleryVerticalEnd,
    Map,
    PieChart,
    Settings2,
    SquareTerminal,
    Home,
    Wallet,
    Settings,
    BarChart3,
    Upload
} from "lucide-react"

import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarRail,
    SidebarGroup,
    SidebarGroupLabel,
} from "@/components/ui/sidebar"
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// This is sample data.
const data = {
    user: {
        name: "Perix",
        email: "m@example.com",
        avatar: "/avatars/shadcn.jpg",
    },
    navMain: [
        {
            title: "Platform",
            items: [
                {
                    title: "Dashboard",
                    url: "/dashboard",
                    icon: Home,
                },
                {
                    title: "Portafoglio",
                    url: "/portfolio",
                    icon: Wallet,
                },
                {
                    title: "Carica Dati",
                    url: "/upload",
                    icon: Upload,
                },
                {
                    title: "Analisi",
                    url: "/analytics",
                    icon: BarChart3,
                },
            ],
        },
        {
            title: "Settings",
            items: [
                {
                    title: "Configurazione",
                    url: "/settings",
                    icon: Settings,
                },
            ],
        },
    ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
    const pathname = usePathname();

    return (
        <Sidebar collapsible="icon" {...props}>
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <Link href="/">
                                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                                    <GalleryVerticalEnd className="size-4" />
                                </div>
                                <div className="grid flex-1 text-left text-sm leading-tight">
                                    <span className="truncate font-semibold">PerixMonitor</span>
                                    <span className="truncate text-xs">V0.1.0</span>
                                </div>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>Menu</SidebarGroupLabel>
                    <SidebarMenu>
                        {data.navMain.map((group) => (
                            group.items.map((item) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton asChild isActive={pathname === item.url} tooltip={item.title}>
                                        <Link href={item.url}>
                                            <item.icon />
                                            <span>{item.title}</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))
                        ))}
                    </SidebarMenu>
                </SidebarGroup>
            </SidebarContent>
            <SidebarFooter>
                <div className="p-4 flex items-center gap-3">
                    <Avatar className="h-8 w-8 rounded-lg">
                        <AvatarImage src={data.user.avatar} alt={data.user.name} />
                        <AvatarFallback className="rounded-lg">PX</AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                        <span className="truncate font-semibold">{data.user.name}</span>
                        <span className="truncate text-xs">{data.user.email}</span>
                    </div>
                </div>
            </SidebarFooter>
            <SidebarRail />
        </Sidebar>
    )
}
