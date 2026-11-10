import { count, lt, sql } from 'drizzle-orm';
import type { Db } from '../db.js';
import { dailyStats, events, sessions, visitors } from '../../db/schema/core.js';
import { parseUa } from './ua.js';
import { hashIp, moscowDay } from './time.js';

export interface ClientEvent {
    /** Тип: page_view, click, js_error, … */
    t: string;
    /** Имя: что кликнули, текст ошибки, метрика. */
    n?: string;
    /** Путь страницы. */
    p?: string;
    /** Время на клиенте, мс. */
    ts?: number;
    /** Детали. */
    d?: Record<string, unknown>;
}

export interface IngestBatch {
    /** Анонимный id посетителя (localStorage). */
    v: string;
    /** Id визита (новый после 30 минут без активности). */
    s: string;
    /** Сколько вкладка была на экране за визит, мс. */
    vis?: number;
    /** Откуда пришли — шлётся в начале визита. */
    r?: string;
    e: ClientEvent[];
}

export interface RequestMeta {
    ip?: string;
    ua?: string;
    reqId?: string;
}

export interface ServerEvent {
    type: string;
    name?: string;
    path?: string;
    data?: Record<string, unknown>;
}

const MAX_DATA_JSON = 4000;

function toJson(data: unknown): string | null {
    if (data === undefined || data === null) return null;
    const json = JSON.stringify(data);
    return json.length > MAX_DATA_JSON ? JSON.stringify({ truncated: json.slice(0, MAX_DATA_JSON) }) : json;
}

/** Метрики дневных агрегатов: имя → SQL-выражение по событиям одного дня. */
const DAILY_METRICS: Record<string, string> = {
    page_views: `sum(type = 'page_view' and is_bot = 0)`,
    visits: `count(distinct case when is_bot = 0 then session_id end)`,
    visitors: `count(distinct case when is_bot = 0 then visitor_id end)`,
    clicks: `sum(type = 'click' and is_bot = 0)`,
    shares: `sum(type = 'share' and is_bot = 0)`,
    js_errors: `sum(type in ('js_error', 'unhandled_rejection', 'react_error'))`,
    requests: `sum(type = 'request')`,
    server_errors: `sum(type = 'server_error')`,
    bot_events: `sum(is_bot = 1)`,
    visitors_mobile: `count(distinct case when is_bot = 0 and device = 'mobile' then visitor_id end)`,
    visitors_inapp: `count(distinct case when is_bot = 0 and inapp is not null then visitor_id end)`,
};

export class StatsService {
    private countersCache: { at: number; value: { visits: number; users: number } } | null = null;

    constructor(
        private readonly db: Db,
        private readonly ipHashSecret: string,
        private readonly retentionDays: number,
        private readonly now: () => number = Date.now,
    ) {}

    /** Пачка событий с фронта. Боты пишутся в лог с флагом, но в счётчики не попадают. */
    ingest(batch: IngestBatch, meta: RequestMeta): void {
        const ts = this.now();
        const day = moscowDay(ts);
        const ua = parseUa(meta.ua);
        const ipHash = hashIp(meta.ip, this.ipHashSecret, day);
        const firstPage = batch.e.find((e) => e.t === 'page_view')?.p ?? batch.e[0]?.p ?? null;

        this.db.transaction((tx) => {
            if (batch.e.length > 0) {
                tx.insert(events)
                    .values(
                        batch.e.map((e) => ({
                            ts,
                            clientTs: e.ts ?? null,
                            day,
                            type: e.t,
                            name: e.n ?? null,
                            path: e.p ?? null,
                            visitorId: batch.v,
                            sessionId: batch.s,
                            ipHash,
                            device: ua.device,
                            os: ua.os,
                            browser: ua.browser,
                            inapp: ua.inapp,
                            isBot: ua.isBot,
                            reqId: meta.reqId ?? null,
                            data: toJson(e.d),
                        })),
                    )
                    .run();
            }

            if (ua.isBot) return;

            tx.insert(visitors)
                .values({
                    id: batch.v,
                    firstSeen: ts,
                    lastSeen: ts,
                    firstDay: day,
                    device: ua.device,
                    os: ua.os,
                    browser: ua.browser,
                    inapp: ua.inapp,
                    referrer: batch.r ?? null,
                })
                .onConflictDoUpdate({ target: visitors.id, set: { lastSeen: ts } })
                .run();

            tx.insert(sessions)
                .values({
                    id: batch.s,
                    visitorId: batch.v,
                    startedAt: ts,
                    lastSeen: ts,
                    day,
                    events: batch.e.length,
                    visibleMs: batch.vis ?? 0,
                    entryPath: firstPage,
                    referrer: batch.r ?? null,
                })
                .onConflictDoUpdate({
                    target: sessions.id,
                    set: {
                        lastSeen: ts,
                        events: sql`${sessions.events} + ${batch.e.length}`,
                        visibleMs: sql`max(${sessions.visibleMs}, ${batch.vis ?? 0})`,
                    },
                })
                .run();
        });

        this.countersCache = null;
    }

    /** Событие бэка: запрос, ошибка, бизнес-событие фичи (вход, заказ, …). */
    logServerEvent(event: ServerEvent, meta: RequestMeta): void {
        const ts = this.now();
        const day = moscowDay(ts);
        const ua = parseUa(meta.ua);
        this.db
            .insert(events)
            .values({
                ts,
                day,
                type: event.type,
                name: event.name ?? null,
                path: event.path ?? null,
                ipHash: hashIp(meta.ip, this.ipHashSecret, day),
                device: ua.device,
                os: ua.os,
                browser: ua.browser,
                inapp: ua.inapp,
                isBot: ua.isBot,
                reqId: meta.reqId ?? null,
                data: toJson(event.data),
            })
            .run();
    }

    /** Публичные счётчики для подвала. Кэш 30 секунд — подвал дёргают на каждом открытии. */
    counters(): { visits: number; users: number } {
        const ts = this.now();
        if (this.countersCache && ts - this.countersCache.at < 30_000) return this.countersCache.value;
        const visits = this.db.select({ n: count() }).from(sessions).get()?.n ?? 0;
        const users = this.db.select({ n: count() }).from(visitors).get()?.n ?? 0;
        const value = { visits, users };
        this.countersCache = { at: ts, value };
        return value;
    }

    /**
     * Пересчитывает дневные агрегаты по всем дням, где ещё есть сырые события, и удаляет события
     * старше срока хранения. Идемпотентно: можно звать сколько угодно раз.
     */
    maintain(): { days: number; deleted: number } {
        const ts = this.now();
        const days = this.db
            .selectDistinct({ day: events.day })
            .from(events)
            .all()
            .map((r) => r.day);

        const columns = Object.entries(DAILY_METRICS)
            .map(([name, expr]) => `coalesce(${expr}, 0) as ${name}`)
            .join(', ');

        this.db.transaction((tx) => {
            for (const day of days) {
                const row = tx.get<Record<string, number>>(sql`select ${sql.raw(columns)} from ${events} where ${events.day} = ${day}`);
                if (!row) continue;
                for (const [metric, value] of Object.entries(row)) {
                    tx.insert(dailyStats)
                        .values({ day, metric, value: Number(value) })
                        .onConflictDoUpdate({ target: [dailyStats.day, dailyStats.metric], set: { value: Number(value) } })
                        .run();
                }
            }
        });

        // Удаляем целыми днями: иначе следующий пересчёт перезаписал бы агрегат неполного дня.
        const cutoffDay = moscowDay(ts - this.retentionDays * 24 * 60 * 60 * 1000);
        const deleted = this.db.delete(events).where(lt(events.day, cutoffDay)).run().changes;
        return { days: days.length, deleted };
    }
}
