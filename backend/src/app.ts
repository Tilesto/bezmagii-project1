import Fastify, { type FastifyError } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import { Type, type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { loadConfig, type Config } from './core/config.js';
import { openDb, type Db, type DbHandle } from './core/db.js';
import { readProject, type ProjectInfo } from './core/project.js';
import { StatsService } from './core/stats/stats.service.js';
import { statsRoutes } from './core/stats/stats.routes.js';
import { features } from './features.js';

declare module 'fastify' {
    interface FastifyInstance {
        config: Config;
        project: ProjectInfo;
        db: Db;
        dbh: DbHandle;
        stats: StatsService;
    }
}

/** Запросы, которые не пишем в аудит: иначе каждая пачка событий порождала бы ещё одно. */
const NOT_AUDITED = ['/api/events', '/api/health'];

export async function buildApp(overrides: Partial<Config> = {}) {
    const config = loadConfig(overrides);
    const project = readProject(config.projectJsonPath);
    const dbh = openDb(config.dbPath, config.migrationsDir);
    const stats = new StatsService(dbh.db, config.ipHashSecret, config.eventsRetentionDays);

    const app = Fastify({
        logger: config.env === 'test' ? false : { level: config.logLevel },
        // За nginx: реальный IP берём из X-Forwarded-For.
        trustProxy: true,
        genReqId: () => crypto.randomUUID(),
    }).withTypeProvider<TypeBoxTypeProvider>();

    app.decorate('config', config);
    app.decorate('project', project);
    app.decorate('db', dbh.db);
    app.decorate('dbh', dbh);
    app.decorate('stats', stats);
    app.addHook('onClose', async () => dbh.close());

    // Swagger нужен только для генерации типов фронта (npm run api:gen) — на проде не грузим, экономим память.
    if (config.env !== 'production') {
        await app.register(swagger, {
            openapi: { info: { title: project.title || project.slug, version: project.version } },
        });
    }
    await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

    // Аудит каждого запроса бэка: маршрут, статус, длительность. reqId связывает с логами pino.
    app.addHook('onResponse', async (request, reply) => {
        const path = request.url.split('?')[0] ?? '';
        if (request.method === 'OPTIONS' || NOT_AUDITED.includes(path)) return;
        try {
            stats.logServerEvent(
                {
                    type: 'request',
                    name: `${request.method} ${request.routeOptions.url ?? '<not found>'}`,
                    path,
                    data: { status: reply.statusCode, ms: Math.round(reply.elapsedTime) },
                },
                { ip: request.ip, ua: request.headers['user-agent'], reqId: request.id },
            );
        } catch (error) {
            request.log.error({ err: error }, 'audit write failed');
        }
    });

    app.setErrorHandler((error: FastifyError, request, reply) => {
        if (error.validation) {
            return reply.code(400).send({ error: 'bad_request', message: error.message });
        }
        const status = error.statusCode ?? 500;
        if (status < 500) {
            return reply.code(status).send({ error: error.code ?? 'error', message: error.message });
        }
        request.log.error({ err: error }, 'unhandled error');
        try {
            stats.logServerEvent(
                {
                    type: 'server_error',
                    name: error.message.slice(0, 300),
                    path: request.url.split('?')[0],
                    data: { route: request.routeOptions.url, stack: error.stack?.split('\n').slice(0, 6).join('\n') },
                },
                { ip: request.ip, ua: request.headers['user-agent'], reqId: request.id },
            );
        } catch {
            // аудит не должен ронять ответ
        }
        return reply.code(500).send({ error: 'internal' });
    });

    await app.register(
        async (api) => {
            api.get(
                '/health',
                {
                    schema: {
                        tags: ['core'],
                        response: { 200: Type.Object({ ok: Type.Boolean(), slug: Type.String(), version: Type.String() }) },
                    },
                },
                async () => ({ ok: true, slug: project.slug, version: project.version }),
            );
            await api.register(statsRoutes);
            for (const feature of features) await api.register(feature.plugin);
        },
        { prefix: '/api' },
    );

    return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
