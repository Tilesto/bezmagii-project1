import { createHash, timingSafeEqual } from 'node:crypto';
import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { FastifyRequest } from 'fastify';

const Id = Type.String({ minLength: 8, maxLength: 64, pattern: '^[A-Za-z0-9_-]+$' });

const ClientEvent = Type.Object({
    t: Type.String({ pattern: '^[a-z_]{1,32}$', description: 'Тип события: page_view, click, js_error, …' }),
    n: Type.Optional(Type.String({ maxLength: 300 })),
    p: Type.Optional(Type.String({ maxLength: 300 })),
    ts: Type.Optional(Type.Number()),
    d: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

const EventsBatch = Type.Object({
    v: Id,
    s: Id,
    vis: Type.Optional(Type.Integer({ minimum: 0 })),
    r: Type.Optional(Type.String({ maxLength: 500 })),
    e: Type.Array(ClientEvent, { maxItems: 50 }),
});

const Counters = Type.Object({ visits: Type.Integer(), users: Type.Integer() });

const MAX_QUERY_ROWS = 5000;

function sha256(value: string): Buffer {
    return createHash('sha256').update(value).digest();
}

/** Публичная статистика (приём событий, счётчики) и закрытые эндпоинты для Claude. */
export const statsRoutes: FastifyPluginAsyncTypebox = async (app) => {
    const expectedToken = sha256(app.config.adminToken);

    function requireAdmin(request: FastifyRequest): void {
        const header = request.headers.authorization ?? '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : '';
        if (!token || !timingSafeEqual(sha256(token), expectedToken)) {
            throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
        }
    }

    app.post(
        '/events',
        {
            bodyLimit: 64 * 1024,
            config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
            schema: { tags: ['stats'], summary: 'Пачка событий аудита с фронта', body: EventsBatch, response: { 204: Type.Null() } },
        },
        async (request, reply) => {
            app.stats.ingest(request.body, { ip: request.ip, ua: request.headers['user-agent'], reqId: request.id });
            return reply.code(204).send(null);
        },
    );

    app.get(
        '/stats',
        { schema: { tags: ['stats'], summary: 'Счётчики для подвала', response: { 200: Counters } } },
        async (_request, reply) => {
            // Каталог на bezmagii.site показывает цифры всех сайтов — читает их кросс-доменно.
            reply.header('Access-Control-Allow-Origin', '*').header('Cache-Control', 'public, max-age=30');
            return app.stats.counters();
        },
    );

    app.get(
        '/admin/summary',
        { schema: { hide: true } },
        async (request) => {
            requireAdmin(request);
            app.stats.maintain();
            const days = app.dbh.readonly
                .prepare(
                    `select day, json_group_object(metric, value) as metrics from daily_stats
                     group by day order by day desc limit 30`,
                )
                .all() as Array<{ day: string; metrics: string }>;
            return {
                project: app.project,
                counters: app.stats.counters(),
                days: days.map((d) => ({ day: d.day, ...JSON.parse(d.metrics) })),
            };
        },
    );

    app.post(
        '/admin/query',
        {
            schema: {
                hide: true,
                body: Type.Object({ sql: Type.String({ maxLength: 10_000 }), params: Type.Optional(Type.Array(Type.Unknown())) }),
            },
        },
        async (request, reply) => {
            requireAdmin(request);
            // Отдельное соединение readonly: даже по токену запись невозможна.
            let stmt;
            try {
                stmt = app.dbh.readonly.prepare(request.body.sql);
            } catch (error) {
                return reply.code(400).send({ error: 'bad_sql', message: (error as Error).message });
            }
            if (!stmt.reader) return reply.code(400).send({ error: 'not_a_select' });

            const rows: unknown[] = [];
            let truncated = false;
            for (const row of stmt.iterate(...((request.body.params ?? []) as unknown[]))) {
                if (rows.length >= MAX_QUERY_ROWS) {
                    truncated = true;
                    break;
                }
                rows.push(row);
            }
            return { columns: stmt.columns().map((c) => c.name), rows, truncated };
        },
    );
};
