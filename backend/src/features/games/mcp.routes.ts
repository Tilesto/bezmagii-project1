import type { FastifyPluginAsync } from 'fastify';
import { GameError, LIMITS, type GameSummary } from './games.service.js';

// MCP-сервер (Model Context Protocol), транспорт Streamable HTTP без сессий и без SSE:
// каждый POST — одно JSON-RPC сообщение, ответ — обычный JSON. Этого хватает клиентам вроде
// Claude Code: `claude mcp add --transport http project1 https://…/api/mcp/<токен>`.
// Токен в адресе, а не в заголовке, — так адрес подходит и клиентам, где заголовок не задать.

const LATEST_PROTOCOL = '2025-06-18';

const GAME_RULES = `Требования к игре (иначе она не запустится на сайте):
- Один самодостаточный HTML-документ: весь JS и CSS внутри. Картинки — рисовать на canvas, SVG или data: URI. Звук — Web Audio API.
- Сети нет: внешние скрипты, CDN, шрифты, fetch и WebSocket заблокированы политикой безопасности.
- Игра запускается в изолированном iframe. localStorage и sessionStorage там работают только в памяти и сбрасываются при перезапуске; cookie, alert/confirm/prompt, всплывающие окна и переход по ссылкам недоступны.
- Её чаще всего открывают с телефона: управление и тачем (кнопки на экране или свайпы), и клавиатурой; размер подстраивается под окно (resize), страница не прокручивается, жесты не тянут страницу (touch-action: none на игровом поле).
- Язык интерфейса — как у пользователя (по умолчанию русский).
- Размер — до 10 МБ, игр в пространстве — до ${LIMITS.gamesPerSpace}.`;

const INSTRUCTIONS = `Этот сервер — сайт «Игры через MCP» (project1.bezmagii.site): пользователь просит игру, ты пишешь её целиком и сохраняешь через create_game, а она сразу появляется у пользователя на сайте во вкладке браузера.

${GAME_RULES}

Порядок работы: create_game → попроси пользователя открыть игру на сайте (если вкладка открыта, игра откроется сама) и попробовать → get_errors, чтобы увидеть ошибки JS из его браузера → исправь через update_game (вкладка перезапустит игру сама). Чтобы править, сначала get_game: там текущий код.`;

interface Tool {
    name: string;
    title: string;
    description: string;
    inputSchema: Record<string, unknown>;
    annotations?: Record<string, boolean>;
}

const id = { type: 'string', description: 'id игры (из create_game или list_games)' };

const TOOLS: Tool[] = [
    {
        name: 'create_game',
        title: 'Создать игру',
        description: `Сохраняет новую игру, она сразу появляется у пользователя на сайте.\n\n${GAME_RULES}`,
        inputSchema: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Короткое название, до 80 символов' },
                html: { type: 'string', description: 'Полный HTML-документ игры' },
            },
            required: ['title', 'html'],
        },
    },
    {
        name: 'update_game',
        title: 'Обновить игру',
        description: 'Заменяет код игры целиком (и, если передано, название). Открытая вкладка перезапустит игру сама.',
        inputSchema: {
            type: 'object',
            properties: {
                id,
                html: { type: 'string', description: 'Новый полный HTML-документ игры' },
                title: { type: 'string', description: 'Новое название (необязательно)' },
            },
            required: ['id', 'html'],
        },
    },
    {
        name: 'get_game',
        title: 'Код игры',
        description: 'Текущий HTML игры, чтобы править его.',
        inputSchema: { type: 'object', properties: { id }, required: ['id'] },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_games',
        title: 'Список игр',
        description: 'Игры пользователя: id, название, размер, версия.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_errors',
        title: 'Ошибки из браузера',
        description:
            'Ошибки JavaScript, которые поймала вкладка пользователя при запуске текущей версии игры, и запускалась ли эта версия вообще. Если не запускалась — попроси пользователя открыть игру на сайте.',
        inputSchema: { type: 'object', properties: { id }, required: ['id'] },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'delete_game',
        title: 'Удалить игру',
        description: 'Удаляет игру насовсем.',
        inputSchema: { type: 'object', properties: { id }, required: ['id'] },
        annotations: { destructiveHint: true },
    },
];

type Json = Record<string, unknown>;
interface RpcMessage {
    jsonrpc?: string;
    id?: string | number | null;
    method?: string;
    params?: Json;
}

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(2)} МБ`;

export const mcpRoutes: FastifyPluginAsync = async (app) => {
    const siteUrl = (process.env.SITE_URL ?? `https://${app.project.slug}.bezmagii.site`).replace(/\/$/, '');
    const games = app.games;

    const describe = (g: GameSummary) => `${g.title} (id ${g.id}, версия ${g.version}, ${mb(g.size)}) ${siteUrl}/play/${g.id}`;
    const str = (args: Json, key: string): string => {
        const v = args[key];
        if (typeof v !== 'string') throw new GameError('bad_input', `Нужен параметр ${key} (строка)`);
        return v;
    };

    function callTool(space: string, name: string, args: Json): string {
        switch (name) {
            case 'create_game': {
                const g = games.create(space, str(args, 'title'), str(args, 'html'));
                const left = LIMITS.gamesPerSpace - games.count(space);
                return `Игра сохранена: ${describe(g)}\nЕсли вкладка сайта открыта, игра уже запущена. Можно сохранить ещё игр: ${left}.\nДальше: попроси пользователя поиграть и вызови get_errors с id ${g.id}.`;
            }
            case 'update_game': {
                const title = typeof args.title === 'string' ? args.title : undefined;
                const g = games.update(space, str(args, 'id'), str(args, 'html'), title);
                return `Обновлено: ${describe(g)}\nОткрытая вкладка перезапустит игру сама. Проверь ошибки через get_errors.`;
            }
            case 'get_game': {
                const g = games.get(space, str(args, 'id'));
                return `${describe(g)}\n\n${g.html}`;
            }
            case 'list_games': {
                const list = games.list(space);
                if (!list.length) return `Игр пока нет. Предел — ${LIMITS.gamesPerSpace}.`;
                return `Игр: ${list.length} из ${LIMITS.gamesPerSpace}\n` + list.map((g) => `- ${describe(g)}`).join('\n');
            }
            case 'get_errors': {
                const r = games.errors(space, str(args, 'id'));
                if (!r.opened) {
                    return `Версию ${r.version} ещё не запускали во вкладке. Попроси пользователя открыть игру на сайте и поиграть, потом спроси ещё раз.`;
                }
                const ago = r.openedAt ? Math.round((Date.now() - r.openedAt) / 1000) : null;
                const head = `Версия ${r.version} запускалась во вкладке${ago !== null ? ` (${ago} с назад)` : ''}.`;
                if (!r.errors.length) return `${head} Ошибок JS не было. Логические ошибки так не поймать, спроси пользователя, как играется.`;
                return `${head} Ошибки (${r.errors.length}):\n` + r.errors.map((e) => `- ${e.message}`).join('\n');
            }
            case 'delete_game': {
                games.delete(space, str(args, 'id'));
                return 'Игра удалена.';
            }
            default:
                throw Object.assign(new Error(`Нет инструмента ${name}`), { rpcCode: -32602 });
        }
    }

    function handle(space: string, msg: RpcMessage): Json | null {
        const reply = (result: Json) => ({ jsonrpc: '2.0', id: msg.id ?? null, result });
        const fail = (code: number, message: string) => ({ jsonrpc: '2.0', id: msg.id ?? null, error: { code, message } });

        if (msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(-32600, 'Invalid Request');
        // Уведомления (без id) ответа не требуют.
        if (msg.id === undefined || msg.method.startsWith('notifications/')) return null;

        switch (msg.method) {
            case 'initialize': {
                const asked = msg.params?.protocolVersion;
                return reply({
                    protocolVersion: typeof asked === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : LATEST_PROTOCOL,
                    capabilities: { tools: { listChanged: false } },
                    serverInfo: { name: `bezmagii-${app.project.slug}`, title: app.project.title, version: app.project.version },
                    instructions: INSTRUCTIONS,
                });
            }
            case 'ping':
                return reply({});
            case 'tools/list':
                return reply({ tools: TOOLS });
            case 'tools/call': {
                const name = typeof msg.params?.name === 'string' ? msg.params.name : '';
                const args = (msg.params?.arguments ?? {}) as Json;
                try {
                    const text = callTool(space, name, args);
                    return reply({ content: [{ type: 'text', text }] });
                } catch (error) {
                    if (error instanceof GameError) return reply({ content: [{ type: 'text', text: error.message }], isError: true });
                    const rpcCode = (error as { rpcCode?: number }).rpcCode;
                    if (rpcCode) return fail(rpcCode, (error as Error).message);
                    throw error;
                }
            }
            default:
                return fail(-32601, `Method not found: ${msg.method}`);
        }
    }

    app.post<{ Params: { token: string } }>(
        '/mcp/:token',
        {
            // 10 МБ игры + экранирование в JSON.
            bodyLimit: 24 * 1024 * 1024,
            config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
            schema: { hide: true },
        },
        async (request, reply) => {
            const space = games.resolveSpace(request.params.token);
            if (!space) {
                return reply.code(404).send({
                    jsonrpc: '2.0',
                    id: null,
                    error: { code: -32001, message: 'Адрес не найден. Возьмите свой адрес MCP на сайте.' },
                });
            }
            const body = request.body as RpcMessage | RpcMessage[] | undefined;
            if (!body || typeof body !== 'object') {
                return reply.code(400).send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
            }
            if (Array.isArray(body)) {
                const out = body.map((m) => handle(space, m)).filter((r) => r !== null);
                return out.length ? reply.send(out) : reply.code(202).send();
            }
            const out = handle(space, body);
            return out ? reply.send(out) : reply.code(202).send();
        },
    );

    // Потока событий от сервера нет: клиент работает только через POST.
    for (const method of ['GET', 'DELETE'] as const) {
        app.route({
            method,
            url: '/mcp/:token',
            schema: { hide: true },
            handler: async (_request, reply) => reply.code(405).header('Allow', 'POST').send(),
        });
    }
};
