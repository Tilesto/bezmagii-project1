import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../../core/api/client';
import { useToast } from '../../core/toast/toast';
import { authHeaders, setToken, useToken } from './space';

/** Как часто вкладка спрашивает сервер о новых играх. */
const POLL_MS = 2500;

export function useGames() {
    const token = useToken();
    const toast = useToast();

    const query = useQuery({
        queryKey: ['games', token],
        enabled: !!token,
        refetchInterval: POLL_MS,
        refetchIntervalInBackground: false,
        queryFn: async () => {
            const { data, response } = await api.GET('/api/games', { headers: authHeaders(token!) });
            if (response.status === 401) {
                // Пространство удалили (или токен чужой) — забываем его.
                setToken(null);
                toast.show('Адрес MCP больше не действует, получите новый', 'error');
                return null;
            }
            if (!data) throw new Error(`HTTP ${response.status}`);
            return data;
        },
    });

    return { token, ...query };
}

/** Нейросеть создала новую игру — открываем её сразу. */
export function useOpenNewGames(games: Array<{ id: string }> | undefined, currentId?: string) {
    const navigate = useNavigate();
    const known = useRef<Set<string> | null>(null);

    useEffect(() => {
        if (!games) return;
        const ids = new Set(games.map((g) => g.id));
        if (known.current) {
            const fresh = games.find((g) => !known.current!.has(g.id));
            if (fresh && fresh.id !== currentId) navigate(`/play/${fresh.id}`);
        }
        known.current = ids;
    }, [games, currentId, navigate]);
}
