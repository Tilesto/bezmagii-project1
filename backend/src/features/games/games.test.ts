import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { resolve } from 'node:path';
import { buildApp, type App } from '../../app.js';

const GAME = '<!doctype html><html><head><title>t</title></head><body><canvas></canvas><script>1</script></body></html>';

describe('игры и MCP', () => {
    let app: App;
    let token: string;
    let auth: { authorization: string };
    let rpcId = 0;

    const rpc = async (method: string, params?: object, t = token) => {
        const res = await app.inject({
            method: 'POST',
            url: `/api/mcp/${t}`,
            headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
            payload: { jsonrpc: '2.0', id: ++rpcId, method, params },
        });
        return { status: res.statusCode, body: res.body ? res.json() : null };
    };
    const call = async (name: string, args: object) => {
        const { body } = await rpc('tools/call', { name, arguments: args });
        return body.result as { content: Array<{ text: string }>; isError?: boolean };
    };

    before(async () => {
        app = await buildApp({ env: 'test', dbPath: ':memory:', projectJsonPath: resolve('../project.json') });
        await app.ready();
        const res = await app.inject({ method: 'POST', url: '/api/spaces' });
        token = res.json().token;
        auth = { authorization: `Bearer ${token}` };
    });
    after(() => app.close());

    it('токен — 43 символа base64url, без него API не пускает', async () => {
        assert.match(token, /^[A-Za-z0-9_-]{43}$/);
        const res = await app.inject({ method: 'GET', url: '/api/games' });
        assert.equal(res.statusCode, 401);
    });

    it('initialize: версия протокола клиента, инструкции; уведомление → 202', async () => {
        const { status, body } = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test' } });
        assert.equal(status, 200);
        assert.equal(body.result.protocolVersion, '2025-06-18');
        assert.ok(body.result.capabilities.tools);
        assert.match(body.result.instructions, /create_game/);

        const n = await app.inject({
            method: 'POST',
            url: `/api/mcp/${token}`,
            headers: { 'content-type': 'application/json' },
            payload: { jsonrpc: '2.0', method: 'notifications/initialized' },
        });
        assert.equal(n.statusCode, 202);
    });

    it('неизвестный токен → 404, GET → 405', async () => {
        const { status } = await rpc('ping', {}, 'x'.repeat(43));
        assert.equal(status, 404);
        const get = await app.inject({ method: 'GET', url: `/api/mcp/${token}` });
        assert.equal(get.statusCode, 405);
    });

    it('tools/list отдаёт 6 инструментов', async () => {
        const { body } = await rpc('tools/list');
        assert.deepEqual(
            body.result.tools.map((t: { name: string }) => t.name).sort(),
            ['create_game', 'delete_game', 'get_errors', 'get_game', 'list_games', 'update_game'],
        );
    });

    it('create → игра видна во вкладке, update растит версию', async () => {
        const created = await call('create_game', { title: 'Змейка', html: GAME });
        assert.ok(!created.isError, created.content[0]?.text ?? "");
        const id = /id ([A-Za-z0-9_-]{8})/.exec(created.content[0]!.text)![1]!;

        const list = await app.inject({ method: 'GET', url: '/api/games', headers: auth });
        assert.equal(list.json().games[0].title, 'Змейка');

        const updated = await call('update_game', { id, html: GAME.replace('1', '2') });
        assert.match(updated.content[0]!.text, /версия 2/);

        const full = await app.inject({ method: 'GET', url: `/api/games/${id}`, headers: auth });
        assert.equal(full.json().version, 2);
        assert.match(full.json().html, /<script>2<\/script>/);
    });

    it('get_errors: не запускалась → просит открыть; ошибки из вкладки видны нейросети', async () => {
        const created = await call('create_game', { title: 'Ошибка', html: GAME });
        const id = /id ([A-Za-z0-9_-]{8})/.exec(created.content[0]!.text)![1]!;

        assert.match((await call('get_errors', { id })).content[0]!.text, /ещё не запускали/);

        const r = await app.inject({
            method: 'POST',
            url: `/api/games/${id}/report`,
            headers: auth,
            payload: { version: 1, errors: ['ReferenceError: foo is not defined (строка 3)'] },
        });
        assert.equal(r.statusCode, 204);
        assert.match((await call('get_errors', { id })).content[0]!.text, /foo is not defined/);

        // Новая версия — старые ошибки не показываются.
        await call('update_game', { id, html: GAME });
        assert.match((await call('get_errors', { id })).content[0]!.text, /ещё не запускали/);
    });

    it('лимиты: 10 игр на пространство, 10 МБ на игру', async () => {
        const big = await call('create_game', { title: 'Большая', html: 'a'.repeat(10 * 1024 * 1024 + 1) });
        assert.ok(big.isError);
        assert.match(big.content[0]!.text, /предел 10 МБ/);

        const { games } = (await app.inject({ method: 'GET', url: '/api/games', headers: auth })).json();
        for (let i = games.length; i < 10; i++) {
            assert.ok(!(await call('create_game', { title: `Игра ${i}`, html: GAME })).isError);
        }
        const over = await call('create_game', { title: 'Лишняя', html: GAME });
        assert.ok(over.isError);
        assert.match(over.content[0]!.text, /предел/);
    });

    it('чужой токен не видит игры, удаление пространства удаляет игры', async () => {
        const other = (await app.inject({ method: 'POST', url: '/api/spaces' })).json().token;
        const list = await app.inject({ method: 'GET', url: '/api/games', headers: { authorization: `Bearer ${other}` } });
        assert.equal(list.json().games.length, 0);

        const del = await app.inject({ method: 'DELETE', url: '/api/space', headers: auth });
        assert.equal(del.statusCode, 204);
        const after = await app.inject({ method: 'GET', url: '/api/games', headers: auth });
        assert.equal(after.statusCode, 401);
    });
});
