import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import styles from './Toaster.module.scss';

// Тосты одинаковые во всех сайтах: useToast().show('Ссылка скопирована').

export type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
    id: number;
    kind: ToastKind;
    text: string;
}

interface ToastApi {
    show(text: string, kind?: ToastKind): void;
}

const ToastContext = createContext<ToastApi | null>(null);
const DURATION_MS = 4000;
const ICONS: Record<ToastKind, IconName> = { success: 'check', error: 'alert', info: 'info' };
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
    const [items, setItems] = useState<ToastItem[]>([]);

    const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);

    const show = useCallback(
        (text: string, kind: ToastKind = 'success') => {
            const id = nextId++;
            setItems((list) => [...list.slice(-2), { id, kind, text }]);
            window.setTimeout(() => dismiss(id), DURATION_MS);
        },
        [dismiss],
    );

    const api = useMemo(() => ({ show }), [show]);

    return (
        <ToastContext.Provider value={api}>
            {children}
            <div className={styles.toaster} role="status" aria-live="polite">
                {items.map((t) => (
                    <div key={t.id} className={`${styles.toast} ${styles[t.kind]}`}>
                        <Icon name={ICONS[t.kind]} className={styles.icon} />
                        <span className={styles.text}>{t.text}</span>
                        <button type="button" className={styles.close} onClick={() => dismiss(t.id)} aria-label="Закрыть">
                            <Icon name="close" />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast(): ToastApi {
    const api = useContext(ToastContext);
    if (!api) throw new Error('useToast: нет ToastProvider');
    return api;
}
