import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

// --- Tipi ---
export interface CertificateUnderlying {
    id?: number;
    isin?: string;
    name?: string;
    original_ticker?: string;
    corrected_ticker?: string | null;
    strike?: number | null;
    barrier_abs?: number | null;
    barrier?: number | null;
    current?: number | null;
    dist?: number | null;
}

export interface CertificateRow {
    isin: string;
    expiry_date?: string | null;
    barrier_pct?: number | null;
    barrier_type?: string | null;
    coupon_pct?: number | null;
    coupon_freq?: string | null;
    has_memory?: boolean | null;
    is_autocallable?: boolean | null;
    trigger_level?: number | null;
    next_coupon_date?: string | null;
    last_updated?: string | null;
    underlyings: CertificateUnderlying[];
    underlyings_count: number;
    worst_dist: number | null;
}

// --- Keys ---
export const certificatesKeys = {
    all: ['certificates'] as const,
    list: (live: boolean) => ['certificates', 'list', live] as const,
};

// --- Fetchers ---
const fetchCertificates = async (live: boolean): Promise<CertificateRow[]> => {
    const { data } = await axios.get('/api/certificates', { params: { live } });
    return data.certificates as CertificateRow[];
};

// --- Hooks ---
export function useCertificates(live: boolean = true) {
    return useQuery({
        queryKey: certificatesKeys.list(live),
        queryFn: () => fetchCertificates(live),
        staleTime: 60 * 1000,
    });
}

export function useDeleteCertificate() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (isin: string) => {
            const { data } = await axios.delete(`/api/certificates/${isin}`);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: certificatesKeys.all });
        },
    });
}

export function useRefreshCertificate() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (isin: string) => {
            const { data } = await axios.post(`/api/certificates/${isin}/refresh`);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: certificatesKeys.all });
        },
    });
}
