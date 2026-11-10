import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { GameError, GamesService, LIMITS } from './games.service.js';
import { mcpRoutes } from './mcp.routes.js';

declare module 'fastify' {
    interface FastifyInstance {
        games: GamesService;
    }
}

const summaryFields = {
    id: Type.String(),
    title: Type.String(),
    size: Type.Integer(),
    version: Type.Integer(),
    complete: Type.Boolean(),
    parts: Type.Integer(),
    createdAt: Type.Integer(),
    updatedAt: Type.Integer(),
};
const GameSummary = Type.Object(summaryFields);
const GameFull = Type.Object({ ...summaryFields, html: Type.String() });
const GameId = Type.Object({ id: Type.String({ pattern: '^[A-Za-z0-9_-]{8}$' }) });

export function sendGameError(reply: FastifyReply, error: unknown) {
    if (error instanceof GameError) {
        const status = error.code === 'not_found' ? 404 : error.code === 'bad_input' ? 400 : 413;
        return reply.code(status).send({ error: error.code, message: error.message });
    }
    throw error;
}

/** Игры: API для вкладки сайта (по токену в Authorization) и MCP для нейросети (по токену в адресе). */
export const gamesRoutes: FastifyPluginAsyncTypebox = async (app) => {
    app.decorate('games', new GamesService(app.db));

    function spaceOf(request: FastifyRequest): string {
        const header = request.headers.authorization ?? '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : '';
        const space = app.games.resolveSpace(token);
        if (!space) throw Object.assign(new Error('Пространство не найдено'), { statusCode: 401, code: 'no_space' });
        return space;
    }

    app.post(
        '/spaces',
        {
            config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
            schema: { tags: ['games'], summary: 'Новое пространство (токен для MCP)', response: { 200: Type.Object({ token: Type.String() }) } },
        },
        async () => ({ token: app.games.createSpace() }),
    );

    app.delete(
        '/space',
        { schema: { tags: ['games'], summary: 'Удалить пространство со всеми играми', response: { 204: Type.Null() } } },
        async (request, reply) => {
            app.games.deleteSpace(spaceOf(request));
            return reply.code(204).send(null);
        },
    );

    app.get(
        '/games',
        {
            schema: {
                tags: ['games'],
                summary: 'Мои игры',
                response: {
                    200: Type.Object({
                        games: Type.Array(GameSummary),
                        limits: Type.Object({ games: Type.Integer(), gameBytes: Type.Integer() }),
                    }),
                },
            },
        },
        async (request, reply) => {
            reply.header('Cache-Control', 'no-store');
            return { games: app.games.list(spaceOf(request)), limits: { games: LIMITS.gamesPerSpace, gameBytes: LIMITS.gameBytes } };
        },
    );

    app.get(
        '/games/:id',
        { schema: { tags: ['games'], summary: 'Игра целиком', params: GameId, response: { 200: GameFull } } },
        async (request, reply) => {
            reply.header('Cache-Control', 'no-store');
            try {
                return app.games.get(spaceOf(request), request.params.id);
            } catch (error) {
                return sendGameError(reply, error);
            }
        },
    );

    app.delete(
        '/games/:id',
        { schema: { tags: ['games'], summary: 'Удалить игру', params: GameId, response: { 204: Type.Null() } } },
        async (request, reply) => {
            try {
                app.games.delete(spaceOf(request), request.params.id);
                return reply.code(204).send(null);
            } catch (error) {
                return sendGameError(reply, error);
            }
        },
    );

    app.post(
        '/games/:id/report',
        {
            bodyLimit: 64 * 1024,
            config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
            schema: {
                tags: ['games'],
                summary: 'Вкладка запустила игру; ошибки JS, если были',
                params: GameId,
                body: Type.Object({
                    version: Type.Integer({ minimum: 1 }),
                    errors: Type.Array(Type.String({ maxLength: LIMITS.errorChars }), { maxItems: 20 }),
                }),
                response: { 204: Type.Null() },
            },
        },
        async (request, reply) => {
            try {
                app.games.report(spaceOf(request), request.params.id, request.body.version, request.body.errors);
                return reply.code(204).send(null);
            } catch (error) {
                return sendGameError(reply, error);
            }
        },
    );

    await app.register(mcpRoutes);
};
