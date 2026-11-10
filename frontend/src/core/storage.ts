// localStorage в приватном режиме Safari и в части in-app браузеров бросает исключения.
// Все обращения — только через эти функции.

export function storageGet(key: string): string | null {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function storageSet(key: string, value: string): void {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // нет хранилища — живём без запоминания
    }
}

export function storageRemove(key: string): void {
    try {
        window.localStorage.removeItem(key);
    } catch {
        // ignore
    }
}

export function storageGetJson<T>(key: string): T | null {
    const raw = storageGet(key);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

export function storageSetJson(key: string, value: unknown): void {
    storageSet(key, JSON.stringify(value));
}
