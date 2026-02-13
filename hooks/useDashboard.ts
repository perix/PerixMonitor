import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

// --- Types ---

export interface DashboardSummary {
    total_value: number;
    total_invested: number;
    pl_value: number;
    pl_percent: number;
    xirr: number;
    mwr_type: string;
    allocation: any[];
}

export interface DashboardHistory {
    series: any[];
    portfolio: any[];
    mwr_mode?: 'xirr' | 'simple_return' | 'mixed';
}

export interface PortfolioSettings {
    mwr_t1?: number;
    mwr_t2?: number;
    dashboardSelection?: string[];
    [key: string]: any;
}

// --- Keys ---

export const dashboardKeys = {
    all: ['dashboard'] as const,
    summary: (portfolioId: string | null, params: any) => ['dashboard', 'summary', portfolioId, params] as const,
    history: (portfolioId: string | null, params: any) => ['dashboard', 'history', portfolioId, params] as const,
    settings: (portfolioId: string | null) => ['portfolio', 'settings', portfolioId] as const,
};

// --- Fetchers ---

const fetchSummary = async (portfolioId: string, mwrT1: number, mwrT2: number, assets?: string[], xirrMode?: string) => {
    const params: any = { portfolio_id: portfolioId, mwr_t1: mwrT1, mwr_t2: mwrT2 };
    if (assets !== undefined) {
        params.assets = assets.join(',');
    }
    if (xirrMode) {
        params.xirr_mode = xirrMode;
    }
    const { data } = await axios.get('/api/dashboard/summary', { params });
    return data as DashboardSummary;
};

const fetchHistory = async (portfolioId: string, mwrT1: number, mwrT2: number, assets?: string[], xirrMode?: string) => {
    const params: any = { portfolio_id: portfolioId, mwr_t1: mwrT1, mwr_t2: mwrT2 };
    if (assets !== undefined) {
        params.assets = assets.join(',');
    }
    if (xirrMode) {
        params.xirr_mode = xirrMode;
    }
    const { data } = await axios.get('/api/dashboard/history', { params });
    return data as DashboardHistory;
};

const fetchSettings = async (portfolioId: string) => {
    const { data } = await axios.get(`/api/portfolio/${portfolioId}`);
    return data.settings as PortfolioSettings;
};

const updateSettings = async ({ portfolioId, settings }: { portfolioId: string, settings: any }) => {
    const { data } = await axios.patch(`/api/portfolio/${portfolioId}/settings`, settings);
    return data;
};

// --- Hooks ---

export function useDashboardSummary(portfolioId: string | null, mwrT1: number, mwrT2: number, assets?: string[], xirrMode?: string) {
    return useQuery({
        queryKey: dashboardKeys.summary(portfolioId, { mwrT1, mwrT2, assets, xirrMode }),
        queryFn: () => fetchSummary(portfolioId!, mwrT1, mwrT2, assets, xirrMode),
        enabled: !!portfolioId,
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}

export function useDashboardHistory(portfolioId: string | null, mwrT1: number, mwrT2: number, assets?: string[], xirrMode?: string) {
    return useQuery({
        queryKey: dashboardKeys.history(portfolioId, { mwrT1, mwrT2, assets, xirrMode }),
        queryFn: () => fetchHistory(portfolioId!, mwrT1, mwrT2, assets, xirrMode),
        enabled: !!portfolioId,
        staleTime: 5 * 60 * 1000,
    });
}

export interface PortfolioDetails {
    id: string;
    name: string;
    currency: string;
    settings: PortfolioSettings;
}

const fetchPortfolioDetails = async (portfolioId: string) => {
    const { data } = await axios.get(`/api/portfolio/${portfolioId}`);
    return data as PortfolioDetails;
};

export function usePortfolioDetails(portfolioId: string | null) {
    return useQuery({
        queryKey: ['portfolio', 'details', portfolioId],
        queryFn: () => fetchPortfolioDetails(portfolioId!),
        enabled: !!portfolioId,
        staleTime: 10 * 60 * 1000,
    });
}

export function usePortfolioSettings(portfolioId: string | null) {
    return useQuery({
        queryKey: dashboardKeys.settings(portfolioId),
        queryFn: () => fetchSettings(portfolioId!),
        enabled: !!portfolioId,
        staleTime: 10 * 60 * 1000, // Settings change less often
    });
}

export function useUpdatePortfolioSettings() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: updateSettings,
        onMutate: async ({ portfolioId, settings }) => {
            // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
            await queryClient.cancelQueries({ queryKey: dashboardKeys.settings(portfolioId) });

            // Snapshot the previous value
            const previousSettings = queryClient.getQueryData(dashboardKeys.settings(portfolioId));

            // Optimistically update to the new value
            queryClient.setQueryData(dashboardKeys.settings(portfolioId), (old: any) => ({
                ...old,
                ...settings,
            }));

            // Return a context object with the snapshotted value
            return { previousSettings };
        },
        onError: (err, newTodo, context) => {
            // If the mutation fails, use the context returned from onMutate to roll back
            if (context?.previousSettings) {
                queryClient.setQueryData(dashboardKeys.settings(newTodo.portfolioId), context.previousSettings);
            }
        },
        onSettled: (data, error, variables) => {
            // Always refetch after error or success:
            queryClient.invalidateQueries({ queryKey: dashboardKeys.settings(variables.portfolioId) });
            // Also invalidate dashboard data if T1/T2 changed, as IT AFFECTS summary/history
            if (variables.settings.mwr_t1 || variables.settings.mwr_t2) {
                queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            }
        },
    });
}
