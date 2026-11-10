import type { FastifyPluginAsync } from 'fastify';
import { GameError, LIMITS, type Edit, type GameSummary } from './games.service.js';

// MCP-сервер (Model Context Protocol), транспорт Streamable HTTP без сессий и без SSE:
// каждый POST — одно JSON-RPC сообщение, ответ — обычный JSON. Этого хватает клиентам вроде
// Claude Code: `claude mcp add --scope user --transport http bezmagii_project1_mcp https://…/api/mcp/<токен>`.
// Токен в адресе, а не в заголовке, — так адрес подходит и клиентам, где заголовок не задать.

const LATEST_PROTOCOL = '2025-06-18';

const GAME_RULES = `Требования к игре (иначе она не запустится на сайте):
- Один самодостаточный HTML-документ: весь JS и CSS внутри. Картинки — рисовать на canvas, SVG или data: URI. Звук — Web Audio API.
- Сети нет: внешние скрипты, CDN, шрифты, fetch и WebSocket заблокированы политикой безопасности.
- Игра запускается в изолированном iframe. localStorage и sessionStorage там работают только в памяти и сбрасываются при перезапуске; cookie, alert/confirm/prompt, всплывающие окна и переход по ссылкам недоступны.
- Её чаще всего открывают с телефона: управление и тачем (кнопки на экране или свайпы), и клавиатурой; размер подстраивается под окно (resize), страница не прокручивается, жесты не тянут страницу (touch-action: none на игровом поле).
- Язык интерфейса — как у пользователя (по умолчанию русский).
- Размер — до 10 МБ, игр в пространстве — до ${LIMITS.gamesPerSpace}.`;

const WORKFLOW = `Как сохранять:
- Небольшая игра (примерно до 400 строк) — одним вызовом create_game.
- Большая игра — частями, иначе один огромный вызов идёт много минут без признаков жизни и может упереться в лимит длины ответа: create_game с первой частью кода и complete=false, затем append_game по 300–500 строк, в последнем вызове complete=true. Части склеиваются как есть, подряд. Пока игра не дописана, у пользователя на сайте виден прогресс («пишется, часть 3»), запускается она только после complete=true.
- Исправления — через edit_game: точечные замены фрагментов, без пересылки всего кода. update_game — только если переписываешь игру целиком.
- get_game отдаёт код кусками по строкам (from_line, to_line), если файл большой.

Порядок работы: сохрани игру → попроси пользователя открыть её на сайте (если вкладка открыта, игра откроется сама) и поиграть → get_errors, чтобы увидеть ошибки JS из его браузера → исправь через edit_game (вкладка перезапустит игру сама).`;

const INSTRUCTIONS = `Этот сервер — сайт «Игры через MCP» (project1.bezmagii.site): пользователь просит игру, ты пишешь её и сохраняешь сюда, а она сразу появляется у пользователя на сайте во вкладке браузера.

${GAME_RULES}

${WORKFLOW}`;

interface Tool {
    name: string;
    title: string;
    description: string;
    inputSchema: Record<string, unknown>;
    annotations?: Record<string, boolean>;
}

const id = { type: 'string', description: 'id игры (из create_game или list_games)' };
const complete = {
    type: 'boolean',
    description: 'true (по умолчанию) — код целиком, игру можно запускать. false — это только часть, дальше будут append_game.',
};
const GET_GAME_MAX_LINES = 1500;

const TOOLS: Tool[] = [
    {
        name: 'create_game',
        title: 'Создать игру',
        description: `Сохраняет новую игру, она сразу появляется у пользователя на сайте. Большую игру сохраняй частями: здесь первая часть и complete=false, дальше append_game.\n\n${GAME_RULES}`,
        inputSchema: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Короткое название, до 80 символов' },
                html: { type: 'string', description: 'Полный HTML-документ игры или его первая часть (если complete=false)' },
                complete,
            },
            required: ['title', 'html'],
        },
    },
    {
        name: 'append_game',
        title: 'Дописать игру',
        description:
            'Дописывает следующую часть кода в конец игры, которая сохранена с complete=false. Части склеиваются подряд, без разделителей. В последней части передай complete=true: тогда игра запустится у пользователя.',
        inputSchema: {
            type: 'object',
            properties: {
                id,
                html: { type: 'string', description: 'Следующий кусок кода, 300–500 строк' },
                complete: { type: 'boolean', description: 'true — это последняя часть' },
            },
            required: ['id', 'html', 'complete'],
        },
    },
    {
        name: 'edit_game',
        title: 'Поправить игру',
        description:
            'Точечные правки кода: каждый old_str заменяется на new_str. old_str должен встречаться в коде ровно один раз (иначе добавь соседние строки). Правки применяются по порядку, все или ни одной. Открытая вкладка перезапустит игру сама. Это основной способ чинить ошибки.',
        inputSchema: {
            type: 'object',
            properties: {
                id,
                edits: {
                    type: 'array',
                    minItems: 1,
                    items: {
                        type: 'object',
                        properties: {
                            old_str: { type: 'string', description: 'Фрагмент как есть в текущем коде' },
                            new_str: { type: 'string', description: 'Чем заменить (пустая строка — удалить)' },
                        },
                        required: ['old_str', 'new_str'],
                    },
                },
            },
            required: ['id', 'edits'],
        },
    },
    {
        name: 'update_game',
        title: 'Обновить игру',
        description:
            'Заменяет код игры целиком (и, если передано, название). Для исправлений удобнее edit_game. Большой новый код — частями: здесь первая часть и complete=false, дальше append_game.',
        inputSchema: {
            type: 'object',
            properties: {
                id,
                html: { type: 'string', description: 'Новый полный HTML-документ игры или его первая часть' },
                title: { type: 'string', description: 'Новое название (необязательно)' },
                complete,
            },
            required: ['id', 'html'],
        },
    },
    {
        name: 'get_game',
        title: 'Код игры',
        description: `Текущий HTML игры, чтобы править его. Большой код отдаётся кусками по ${GET_GAME_MAX_LINES} строк: укажи from_line и to_line. Номера строк в текст не добавляются, фрагменты можно брать для edit_game как есть.`,
        inputSchema: {
            type: 'object',
            properties: {
                id,
                from_line: { type: 'integer', minimum: 1, description: 'С какой строки (с 1)' },
                to_line: { type: 'integer', minimum: 1, description: 'По какую строку включительно' },
            },
            required: ['id'],
        },
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

    const describe = (g: GameSummary) =>
        `${g.title} (id ${g.id}, версия ${g.version}, ${mb(g.size)}${g.complete ? '' : `, дописывается: частей ${g.parts}`}) ${siteUrl}/play/${g.id}`;
    const str = (args: Json, key: string): string => {
        const v = args[key];
        if (typeof v !== 'string') throw new GameError('bad_input', `Нужен параметр ${key} (строка)`);
        return v;
    };
    const bool = (args: Json, key: string, fallback: boolean): boolean => (typeof args[key] === 'boolean' ? (args[key] as boolean) : fallback);
    const int = (args: Json, key: string): number | undefined =>
        typeof args[key] === 'number' && Number.isInteger(args[key]) && (args[key] as number) > 0 ? (args[key] as number) : undefined;

    function callTool(space: string, name: string, args: Json): string {
        switch (name) {
            case 'create_game': {
                const g = games.create(space, str(args, 'title'), str(args, 'html'), bool(args, 'complete', true));
                const left = LIMITS.gamesPerSpace - games.count(space);
                if (!g.complete) {
                    return `Начата игра: ${describe(g)}\nДописывай через append_game с id ${g.id}, в последней части complete=true. Пользователь видит прогресс на сайте.`;
                }
                return `Игра сохранена: ${describe(g)}\nЕсли вкладка сайта открыта, игра уже запущена. Можно сохранить ещё игр: ${left}.\nДальше: попроси пользователя поиграть и вызови get_errors с id ${g.id}.`;
            }
            case 'append_game': {
                const g = games.append(space, str(args, 'id'), str(args, 'html'), bool(args, 'complete', false));
                if (!g.complete) return `Часть ${g.parts} сохранена, всего ${mb(g.size)}. Дальше append_game, в последней части complete=true.`;
                return `Игра дописана (частей ${g.parts}): ${describe(g)}\nЕсли вкладка сайта открыта, игра уже запущена. Попроси пользователя поиграть и вызови get_errors с id ${g.id}.`;
            }
            case 'edit_game': {
                const edits = Array.isArray(args.edits) ? (args.edits as Edit[]) : [];
                const g = games.edit(space, str(args, 'id'), edits);
                return `Правок применено: ${edits.length}. ${describe(g)}\nОткрытая вкладка перезапустит игру сама. Проверь ошибки через get_errors.`;
            }
            case 'update_game': {
                const title = typeof args.title === 'string' ? args.title : undefined;
                const g = games.update(space, str(args, 'id'), str(args, 'html'), title, bool(args, 'complete', true));
                if (!g.complete) return `Новая версия начата: ${describe(g)}\nДописывай через append_game, в последней части complete=true.`;
                return `Обновлено: ${describe(g)}\nОткрытая вкладка перезапустит игру сама. Проверь ошибки через get_errors.`;
            }
            case 'get_game': {
                const g = games.get(space, str(args, 'id'));
                const lines = g.html.split('\n');
                const from = int(args, 'from_line') ?? 1;
                const to = Math.min(int(args, 'to_line') ?? from + GET_GAME_MAX_LINES - 1, from + GET_GAME_MAX_LINES - 1, lines.length);
                if (from === 1 && to >= lines.length) return `${describe(g)}\nСтрок: ${lines.length}\n\n${g.html}`;
                if (from > lines.length) return `${describe(g)}\nВ коде всего ${lines.length} строк.`;
                const more = to < lines.length ? `\nДальше: get_game с from_line=${to + 1}.` : '';
                return `${describe(g)}\nСтроки ${from}–${to} из ${lines.length}.${more}\n\n${lines.slice(from - 1, to).join('\n')}`;
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
                    serverInfo: { name: `bezmagii_${app.project.slug}_mcp`, title: app.project.title, version: app.project.version },
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
