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
    Upload,
    LogOut
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
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createClient } from "@/utils/supabase/client";
import { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";

const data = {
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
    const router = useRouter();
    const supabase = createClient();
    const [user, setUser] = React.useState<{ name?: string, email?: string } | null>(null);

    React.useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setUser({
                    name: user.user_metadata?.full_name || user.email?.split('@')[0],
                    email: user.email,
                });
            }
        };
        getUser();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
            if (session?.user) {
                setUser({
                    name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0],
                    email: session.user.email,
                });
            } else {
                setUser(null);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.refresh();
        router.push('/login');
    };

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
                <div className="p-4 flex items-center justify-between gap-3 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:p-2">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Avatar className="h-8 w-8 rounded-lg text-slate-900 shrink-0">
                            <AvatarFallback className="rounded-lg bg-indigo-500 font-bold">
                                {user?.name?.substring(0, 2).toUpperCase() || '??'}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                            <span className="font-semibold text-slate-200 truncate" title={user?.name}>{user?.name || 'Utente'}</span>
                            <span className="text-xs text-slate-400 truncate" title={user?.email}>{user?.email || 'Non loggato'}</span>
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-white hover:bg-white/10"
                        onClick={handleLogout}
                        title="Logout"
                    >
                        <LogOut className="h-4 w-4" />
                    </Button>
                </div>
            </SidebarFooter>
            <SidebarRail />
        </Sidebar>
    )
}
