import { useCallback, useSyncExternalStore } from 'react';
import { api } from '../../core/api/client';
import { siteUrl } from '../../core/project';
import { storageGet, storageRemove, storageSet } from '../../core/storage';

// Пространство пользователя = секретный токен. Живёт в localStorage и в адресе MCP.
// Аккаунтов нет: кто знает адрес, тот видит и меняет игры.

const KEY = 'p1.token';
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const listeners = new Set<() => void>();

function emit() {
    for (const l of listeners) l();
}

export function getToken(): string | null {
    const t = storageGet(KEY);
    return t && TOKEN_RE.test(t) ? t : null;
}

export function setToken(token: string | null) {
    if (token) storageSet(KEY, token);
    else storageRemove(KEY);
    emit();
}

export function useToken(): string | null {
    return useSyncExternalStore(
        (cb) => {
            listeners.add(cb);
            const onStorage = (e: StorageEvent) => e.key === KEY && cb();
            window.addEventListener('storage', onStorage);
            return () => {
                listeners.delete(cb);
                window.removeEventListener('storage', onStorage);
            };
        },
        getToken,
        () => null,
    );
}

// Локально (npm run dev) адрес — этот же localhost: Vite проксирует /api на бэк.
const base = import.meta.env.DEV ? window.location.origin : siteUrl;
export const mcpUrl = (token: string) => `${base}/api/mcp/${token}`;
export const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Токен из вставленного адреса MCP или из самого токена. */
export function parseToken(input: string): string | null {
    const m = /([A-Za-z0-9_-]{43})\/?\s*$/.exec(input.trim());
    return m?.[1] && TOKEN_RE.test(m[1]) ? m[1] : null;
}

export function useCreateSpace() {
    return useCallback(async () => {
        const { data, error } = await api.POST('/api/spaces');
        if (error || !data) throw new Error('Не получилось выдать адрес, попробуйте через минуту');
        setToken(data.token);
        return data.token;
    }, []);
}

/** Есть ли такое пространство на сервере (для «у меня уже есть адрес»). */
export async function checkToken(token: string): Promise<boolean> {
    const { response } = await api.GET('/api/games', { headers: authHeaders(token) });
    return response.ok;
}
