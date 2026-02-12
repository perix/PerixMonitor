import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

// --- Keys ---
export const memoryKeys = {
    all: ['memory'] as const,
    data: (portfolioId: string | null) => ['memory', 'data', portfolioId] as const,
    settings: (portfolioId: string | null, userId: string | null) => ['memory', 'settings', portfolioId, userId] as const,
};

// --- Fetchers ---

const fetchMemoryData = async (portfolioId: string) => {
    const { data } = await axios.get('/api/memory/data', { params: { portfolio_id: portfolioId } });
    return data.data; // Expecting array
};

const fetchMemorySettings = async (portfolioId: string, userId: string) => {
    const { data } = await axios.get('/api/memory/settings', { params: { user_id: userId, portfolio_id: portfolioId } });
    return data.settings;
};

const saveMemorySettings = async ({ portfolioId, userId, settings }: { portfolioId: string, userId: string, settings: any }) => {
    const { data } = await axios.post('/api/memory/settings', { user_id: userId, portfolio_id: portfolioId, settings });
    return data;
};

const saveNote = async ({ portfolioId, assetId, note }: { portfolioId: string, assetId: string, note: string }) => {
    const { data } = await axios.post('/api/memory/notes', { portfolio_id: portfolioId, asset_id: assetId, note });
    return data;
};

// --- Hooks ---

export function useMemoryData(portfolioId: string | null) {
    return useQuery({
        queryKey: memoryKeys.data(portfolioId),
        queryFn: () => fetchMemoryData(portfolioId!),
        enabled: !!portfolioId,
        staleTime: 5 * 60 * 1000,
    });
}

export function useMemorySettings(portfolioId: string | null, userId: string | null) {
    return useQuery({
        queryKey: memoryKeys.settings(portfolioId, userId),
        queryFn: () => fetchMemorySettings(portfolioId!, userId!),
        enabled: !!portfolioId && !!userId,
        staleTime: Infinity, // Settings rarely change unless we change them
    });
}

export function useUpdateMemorySettings() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: saveMemorySettings,
        onMutate: async ({ portfolioId, userId, settings }) => {
            await queryClient.cancelQueries({ queryKey: memoryKeys.settings(portfolioId, userId) });
            const previousSettings = queryClient.getQueryData(memoryKeys.settings(portfolioId, userId));
            queryClient.setQueryData(memoryKeys.settings(portfolioId, userId), settings); // Optimistic? Or partial?
            return { previousSettings };
        },
        onError: (err, variables, context) => {
            if (context?.previousSettings) {
                queryClient.setQueryData(memoryKeys.settings(variables.portfolioId, variables.userId), context.previousSettings);
            }
        },
        onSettled: (data, error, variables) => {
            queryClient.invalidateQueries({ queryKey: memoryKeys.settings(variables.portfolioId, variables.userId) });
        },
    });
}

const saveNotesBatch = async ({ portfolioId, notes }: { portfolioId: string, notes: Record<string, string> }) => {
    const promises = Object.entries(notes).map(([assetId, note]) =>
        axios.post('/api/memory/notes', { portfolio_id: portfolioId, asset_id: assetId, note })
    );
    await Promise.all(promises);
    return true;
};

export function useUpdateMemoryNotesBatch() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: saveNotesBatch,
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({ queryKey: memoryKeys.data(variables.portfolioId) });
        }
    });
}

export function useUpdateMemoryNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: saveNote,
        onSuccess: (data, variables) => {
            // We can optionally invalidate memory data OR update it manually in cache
            // Since we might do batch updates, waiting for refetch might be safer/easier
            // But for "instant" feel, we might want to update cache.

            // For now, let's invalidate.
            queryClient.invalidateQueries({ queryKey: memoryKeys.data(variables.portfolioId) });
        }
    });
}
