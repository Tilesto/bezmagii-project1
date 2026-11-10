import { storageGet, storageRemove, storageSet } from '../storage';

// Тема: по умолчанию системная. После клика выбор запоминается и система больше не влияет.
// Начальную тему ставит inline-скрипт в index.html (ключ bm.theme — тот же).

export type Theme = 'light' | 'dark';

const KEY = 'bm.theme';
const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function storedTheme(): Theme | null {
    const value = storageGet(KEY);
    return value === 'light' || value === 'dark' ? value : null;
}

export function systemTheme(): Theme {
    return darkQuery().matches ? 'dark' : 'light';
}

export function currentTheme(): Theme {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function apply(theme: Theme): void {
    const root = document.documentElement;
    root.dataset.theme = theme;
    // Цвет адресной строки = фон страницы из палитры (_palette.scss → --base-0), не хардкод.
    const bg = getComputedStyle(root).getPropertyValue('--base-0').trim();
    if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
}

/**
 * Переключить тему. Если браузер умеет View Transitions — новая тема раскрывается «волной»
 * из точки клика; иначе — плавный transition цветов. При reduced motion — мгновенно.
 */
export function setTheme(theme: Theme, origin?: { x: number; y: number }): void {
    storageSet(KEY, theme);
    if (theme === currentTheme()) return;

    if (reducedMotion()) {
        apply(theme);
        return;
    }

    if (document.startViewTransition && origin) {
        const radius = Math.hypot(Math.max(origin.x, innerWidth - origin.x), Math.max(origin.y, innerHeight - origin.y));
        const transition = document.startViewTransition(() => apply(theme));
        void transition.ready.then(() => {
            document.documentElement.animate(
                { clipPath: [`circle(0px at ${origin.x}px ${origin.y}px)`, `circle(${radius}px at ${origin.x}px ${origin.y}px)`] },
                { duration: 550, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
            );
        });
        return;
    }

    const root = document.documentElement;
    root.classList.add('theme-transition');
    apply(theme);
    window.setTimeout(() => root.classList.remove('theme-transition'), 450);
}

/** Сбросить выбор и снова следовать системе. */
export function resetTheme(): void {
    storageRemove(KEY);
    apply(systemTheme());
}

/** Пока пользователь не выбрал тему сам, сайт следует за системной. */
export function followSystemTheme(onChange: (theme: Theme) => void): () => void {
    const query = darkQuery();
    const listener = () => {
        if (storedTheme()) return;
        const theme = systemTheme();
        const root = document.documentElement;
        root.classList.add('theme-transition');
        apply(theme);
        window.setTimeout(() => root.classList.remove('theme-transition'), 450);
        onChange(theme);
    };
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
}
