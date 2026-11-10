import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';
import { storageGet, storageGetJson, storageSet, storageSetJson } from '../storage';

// Аудит всего, что происходит на сайте: страницы, клики, тема, «поделиться», ошибки, Web Vitals,
// время на экране. Пачками уходит на бэк этого же сайта (POST /api/events), там — SQLite.
// Ничего персонального: анонимный id посетителя и id визита.

const ENDPOINT = '/api/events';
const VISITOR_KEY = 'bm.vid';
const SESSION_KEY = 'bm.sid';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const FLUSH_DELAY_MS = 3000;
const MAX_QUEUE = 20;
const MAX_BATCH = 50;

interface ClientEvent {
    t: string;
    n?: string;
    p?: string;
    ts: number;
    d?: Record<string, unknown>;
}

interface StoredSession {
    id: string;
    last: number;
    /** Сколько вкладка была на экране за визит, мс. */
    vis: number;
}

function newId(): string {
    return crypto.randomUUID().replace(/-/g, '');
}

let queue: ClientEvent[] = [];
let flushTimer: number | undefined;
let visitorId = '';
let session: StoredSession = { id: '', last: 0, vis: 0 };
let pendingReferrer: string | undefined;
let visibleSince: number | null = null;
let started = false;
let resolveFirstFlush: () => void = () => undefined;

/**
 * Резолвится, когда первая пачка (начало визита) дошла до бэка или через 2 с.
 * Счётчики подвала ждут её, чтобы первый посетитель видел «1», а не «0».
 */
export const firstFlush = new Promise<void>((resolve) => {
    resolveFirstFlush = resolve;
    window.setTimeout(resolve, 2000);
});

function loadVisitor(): string {
    let id = storageGet(VISITOR_KEY);
    if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
        id = newId();
        storageSet(VISITOR_KEY, id);
    }
    return id;
}

/** Продлевает визит или начинает новый, если 30 минут не было активности. */
function touchSession(now: number): void {
    const stored = session.id ? session : storageGetJson<StoredSession>(SESSION_KEY);
    if (stored && now - stored.last < SESSION_TIMEOUT_MS) {
        session = { ...stored, last: now };
    } else {
        session = { id: newId(), last: now, vis: 0 };
        pendingReferrer = document.referrer || undefined;
        queue.push({
            t: 'session_start',
            p: location.pathname,
            ts: now,
            d: {
                lang: navigator.language,
                screen: `${screen.width}x${screen.height}`,
                viewport: `${innerWidth}x${innerHeight}`,
                dpr: devicePixelRatio,
                tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
                standalone: matchMedia('(display-mode: standalone)').matches,
                utm: Object.fromEntries([...new URLSearchParams(location.search)].filter(([k]) => k.startsWith('utm_'))),
            },
        });
    }
    storageSetJson(SESSION_KEY, session);
}

function accumulateVisible(now: number): void {
    if (visibleSince !== null) {
        session.vis += now - visibleSince;
        visibleSince = document.visibilityState === 'visible' ? now : null;
    }
}

/** Отправка. На уходе со страницы — sendBeacon: он доживает до конца даже при закрытии вкладки. */
function flush(onLeave = false): void {
    window.clearTimeout(flushTimer);
    flushTimer = undefined;
    if (queue.length === 0 && !onLeave) return;

    const now = Date.now();
    accumulateVisible(now);
    storageSetJson(SESSION_KEY, session);

    do {
        const events = queue.splice(0, MAX_BATCH);
        const body = JSON.stringify({ v: visitorId, s: session.id, vis: Math.round(session.vis), r: pendingReferrer, e: events });
        pendingReferrer = undefined;
        const blob = new Blob([body], { type: 'application/json' });
        if (onLeave && navigator.sendBeacon?.(ENDPOINT, blob)) continue;
        void fetch(ENDPOINT, { method: 'POST', body: blob, keepalive: true, headers: { 'Content-Type': 'application/json' } })
            .catch(() => undefined)
            .finally(() => resolveFirstFlush());
    } while (queue.length > 0);
}

/** Записать событие. Имя обрезается до 200 символов, детали — объект. */
export function track(type: string, name?: string, data?: Record<string, unknown>): void {
    if (!started) return;
    const now = Date.now();
    touchSession(now);
    queue.push({ t: type, n: name?.slice(0, 200), p: location.pathname.slice(0, 300), ts: now, d: data });
    if (queue.length >= MAX_QUEUE) flush();
    else if (flushTimer === undefined) flushTimer = window.setTimeout(() => flush(), FLUSH_DELAY_MS);
}

let lastPageView = '';

/** Просмотр страницы. Повтор того же пути подряд не считается (StrictMode в dev вызывает эффекты дважды). */
export function trackPageView(): void {
    const path = location.pathname + location.search;
    if (path === lastPageView) return;
    lastPageView = path;
    track('page_view', document.title, location.search ? { search: location.search.slice(0, 200) } : undefined);
}

/** Имя для клика: data-audit → aria-label → текст → href. */
function clickName(el: HTMLElement): string {
    return (
        el.dataset.audit ||
        el.getAttribute('aria-label') ||
        el.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) ||
        el.getAttribute('href') ||
        el.tagName.toLowerCase()
    );
}

function reportVital(metric: Metric): void {
    track('web_vital', metric.name, {
        value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
        rating: metric.rating,
    });
}

export function startAudit(): void {
    if (started || typeof window === 'undefined') return;
    started = true;
    visitorId = loadVisitor();
    visibleSince = document.visibilityState === 'visible' ? Date.now() : null;
    touchSession(Date.now());
    // Начало визита — сразу, чтобы счётчики подвала уже его учитывали. Визит продолжается — ждать нечего.
    if (queue.length > 0) flush();
    else resolveFirstFlush();

    // Клики по всему интерактивному — автоматически. Осмысленное имя задаётся data-audit="…".
    document.addEventListener(
        'click',
        (event) => {
            const target = event.target instanceof Element ? event.target : null;
            const el = target?.closest<HTMLElement>('[data-audit], a, button, [role="button"], summary, input[type="submit"], label');
            if (!el) return;
            track('click', clickName(el), {
                tag: el.tagName.toLowerCase(),
                href: el instanceof HTMLAnchorElement ? el.href : undefined,
            });
        },
        { capture: true },
    );

    window.addEventListener('error', (event) => {
        track('js_error', event.message || 'error', {
            src: event.filename,
            line: event.lineno,
            col: event.colno,
            stack: event.error instanceof Error ? event.error.stack?.slice(0, 1500) : undefined,
        });
    });
    window.addEventListener('unhandledrejection', (event) => {
        const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
        track('unhandled_rejection', reason.message, { stack: reason.stack?.slice(0, 1500) });
    });

    document.addEventListener('visibilitychange', () => {
        const now = Date.now();
        if (document.visibilityState === 'visible') {
            visibleSince = now;
            touchSession(now);
        } else {
            accumulateVisible(now);
            visibleSince = null;
            flush(true);
        }
    });
    window.addEventListener('pagehide', () => flush(true));

    onLCP(reportVital);
    onINP(reportVital);
    onCLS(reportVital);
    onFCP(reportVital);
    onTTFB(reportVital);
}
