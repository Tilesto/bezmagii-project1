import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { firstFlush } from '../audit/audit';

/** Счётчики подвала: посещения и пользователи с бэка этого сайта. */
export function useCounters() {
    return useQuery({
        queryKey: ['stats'],
        queryFn: async () => {
            await firstFlush;
            const { data, error } = await api.GET('/api/stats');
            if (error || !data) throw new Error('stats unavailable');
            return data;
        },
        staleTime: 60 * 1000,
        retry: 1,
    });
}
