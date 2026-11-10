import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Схема ядра: статистика и аудит. Есть в каждом проекте.
// Фичи кладут свои таблицы рядом отдельными файлами (auth.ts, shop.ts, …).

/** Сырые события аудита: фронт (клики, страницы, ошибки, …) и бэк (запросы, ошибки). Хранятся N дней. */
export const events = sqliteTable(
    'events',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        /** Время приёма на сервере, мс. */
        ts: integer('ts').notNull(),
        /** Время на клиенте, мс (для порядка событий внутри пачки). */
        clientTs: integer('client_ts'),
        /** День по Москве, YYYY-MM-DD. */
        day: text('day').notNull(),
        /** page_view, click, js_error, request, server_error, … */
        type: text('type').notNull(),
        name: text('name'),
        path: text('path'),
        visitorId: text('visitor_id'),
        sessionId: text('session_id'),
        /** Хэш IP с суточной солью: уникальных посчитать можно, человека восстановить нельзя. */
        ipHash: text('ip_hash'),
        device: text('device'),
        os: text('os'),
        browser: text('browser'),
        /** instagram / tiktok / telegram / vk / facebook / … — встроенный браузер приложения. */
        inapp: text('inapp'),
        isBot: integer('is_bot', { mode: 'boolean' }).notNull().default(false),
        reqId: text('req_id'),
        /** JSON с деталями события. */
        data: text('data'),
    },
    (t) => [index('events_ts_idx').on(t.ts), index('events_day_type_idx').on(t.day, t.type), index('events_session_idx').on(t.sessionId)],
);

/** Уникальные посетители (анонимный id из localStorage). Хранятся всегда — это счётчик «пользователи». */
export const visitors = sqliteTable('visitors', {
    id: text('id').primaryKey(),
    firstSeen: integer('first_seen').notNull(),
    lastSeen: integer('last_seen').notNull(),
    firstDay: text('first_day').notNull(),
    device: text('device'),
    os: text('os'),
    browser: text('browser'),
    inapp: text('inapp'),
    referrer: text('referrer'),
});

/** Визиты: сессия заканчивается после 30 минут без активности (считает клиент). Счётчик «посещения». */
export const sessions = sqliteTable(
    'sessions',
    {
        id: text('id').primaryKey(),
        visitorId: text('visitor_id').notNull(),
        startedAt: integer('started_at').notNull(),
        lastSeen: integer('last_seen').notNull(),
        day: text('day').notNull(),
        events: integer('events').notNull().default(0),
        /** Сколько вкладка была на экране, мс (присылает клиент). */
        visibleMs: integer('visible_ms').notNull().default(0),
        entryPath: text('entry_path'),
        referrer: text('referrer'),
    },
    (t) => [index('sessions_day_idx').on(t.day)],
);

/** Дневные агрегаты. Сырые события удаляются, эти цифры — нет (для финального ролика). */
export const dailyStats = sqliteTable(
    'daily_stats',
    {
        day: text('day').notNull(),
        metric: text('metric').notNull(),
        value: integer('value').notNull(),
    },
    (t) => [primaryKey({ columns: [t.day, t.metric] })],
);
