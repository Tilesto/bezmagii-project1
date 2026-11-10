import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { resolve } from 'node:path';
import { buildApp, type App } from '../../app.js';
import { openDb } from '../db.js';
import { readProject } from '../project.js';
import { StatsService } from './stats.service.js';
import { parseUa } from './ua.js';
import { hashIp, moscowDay } from './time.js';

const IPHONE_INSTAGRAM =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0 (iPhone15,2; iOS 18_1; ru_RU)';
const DESKTOP_CHROME =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const ADMIN = { authorization: 'Bearer dev-admin-token' };

const batch = (v: string, s: string, extra: object = {}) => ({
    v,
    s,
    e: [
        { t: 'page_view', p: '/' },
        { t: 'click', n: 'Поделиться', p: '/' },
    ],
    ...extra,
});

describe('stats API', () => {
    let app: App;

    before(async () => {
        app = await buildApp({ env: 'test', dbPath: ':memory:', projectJsonPath: resolve('../project.json') });
        await app.ready();
    });
    after(() => app.close());

    it('health отдаёт slug и версию из project.json', async () => {
        const res = await app.inject({ method: 'GET', url: '/api/health' });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().slug, readProject(resolve('../project.json')).slug);
    });

    it('считает посещения и пользователей, ботов не считает', async () => {
        const post = (body: object, ua: string) =>
            app.inject({ method: 'POST', url: '/api/events', payload: body, headers: { 'user-agent': ua } });

        assert.equal((await post(batch('visitor-aaaa', 'session-1111', { r: 'https://instagram.com/' }), IPHONE_INSTAGRAM)).statusCode, 204);
        await post(batch('visitor-aaaa', 'session-1111', { vis: 5000 }), IPHONE_INSTAGRAM); // тот же визит
        await post(batch('visitor-aaaa', 'session-2222'), IPHONE_INSTAGRAM); // новый визит того же человека
        await post(batch('visitor-bbbb', 'session-3333'), DESKTOP_CHROME);
        await post(batch('visitor-bot1', 'session-bot1'), GOOGLEBOT);

        const res = await app.inject({ method: 'GET', url: '/api/stats' });
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.json(), { visits: 3, users: 2 });
        assert.equal(res.headers['access-control-allow-origin'], '*');

        const session = app.dbh.sqlite.prepare(`select events, visible_ms, referrer from sessions where id = 'session-1111'`).get() as Record<string, unknown>;
        assert.deepEqual(session, { events: 4, visible_ms: 5000, referrer: 'https://instagram.com/' });

        const bot = app.dbh.sqlite.prepare(`select count(*) as n from events where is_bot = 1`).get() as { n: number };
        assert.equal(bot.n, 2, 'события ботов пишутся с флагом');

        const inapp = app.dbh.sqlite.prepare(`select inapp, device, os from visitors where id = 'visitor-aaaa'`).get();
        assert.deepEqual({ ...(inapp as object) }, { inapp: 'instagram', device: 'mobile', os: 'ios' });
    });

    it('отбивает мусор валидацией', async () => {
        const bad = await app.inject({ method: 'POST', url: '/api/events', payload: { v: 'x', s: 'y', e: [] } });
        assert.equal(bad.statusCode, 400);

        const badType = await app.inject({
            method: 'POST',
            url: '/api/events',
            payload: { v: 'visitor-cccc', s: 'session-cccc', e: [{ t: 'DROP TABLE' }] },
        });
        assert.equal(badType.statusCode, 400);

        const tooMany = await app.inject({
            method: 'POST',
            url: '/api/events',
            payload: { v: 'visitor-cccc', s: 'session-cccc', e: Array.from({ length: 51 }, () => ({ t: 'click' })) },
        });
        assert.equal(tooMany.statusCode, 400);
    });

    it('пишет аудит запросов бэка, но не самих пачек событий', async () => {
        await app.inject({ method: 'GET', url: '/api/stats' });
        await app.inject({ method: 'GET', url: '/api/nope' });
        const rows = app.dbh.sqlite.prepare(`select name, path, data from events where type = 'request'`).all() as Array<{ name: string; data: string }>;
        assert.ok(rows.some((r) => r.name === 'GET /api/stats' && JSON.parse(r.data).status === 200));
        assert.ok(rows.some((r) => r.name === 'GET <not found>' && JSON.parse(r.data).status === 404));
        assert.ok(!rows.some((r) => r.name.includes('/api/events')));
    });

    it('admin: без токена — 401, с токеном — только чтение', async () => {
        const noToken = await app.inject({ method: 'POST', url: '/api/admin/query', payload: { sql: 'select 1' } });
        assert.equal(noToken.statusCode, 401);

        const wrong = await app.inject({ method: 'POST', url: '/api/admin/query', payload: { sql: 'select 1' }, headers: { authorization: 'Bearer nope' } });
        assert.equal(wrong.statusCode, 401);

        const ok = await app.inject({
            method: 'POST',
            url: '/api/admin/query',
            headers: ADMIN,
            payload: { sql: 'select type, count(*) as n from events where type = ? group by type', params: ['click'] },
        });
        assert.equal(ok.statusCode, 200);
        assert.deepEqual(ok.json().columns, ['type', 'n']);

        const write = await app.inject({ method: 'POST', url: '/api/admin/query', headers: ADMIN, payload: { sql: 'delete from events' } });
        assert.equal(write.statusCode, 400);

        const summary = await app.inject({ method: 'GET', url: '/api/admin/summary', headers: ADMIN });
        assert.equal(summary.statusCode, 200);
        assert.equal(summary.json().days[0].visitors, 2);
    });
});

describe('StatsService.maintain', () => {
    it('считает дневные агрегаты и удаляет сырые события целыми днями', () => {
        const dbh = openDb(':memory:', resolve('drizzle'));
        let now = Date.parse('2026-11-01T12:00:00+03:00');
        const stats = new StatsService(dbh.db, 'secret', 90, () => now);

        stats.ingest({ v: 'visitor-1111', s: 'session-1111', e: [{ t: 'page_view', p: '/' }, { t: 'js_error', n: 'boom' }] }, { ua: DESKTOP_CHROME });
        stats.maintain();
        const metric = (day: string, name: string) =>
            (dbh.sqlite.prepare('select value from daily_stats where day = ? and metric = ?').get(day, name) as { value: number } | undefined)?.value;
        assert.equal(metric('2026-11-01', 'page_views'), 1);
        assert.equal(metric('2026-11-01', 'js_errors'), 1);

        now += 91 * 24 * 60 * 60 * 1000;
        const { deleted } = stats.maintain();
        assert.equal(deleted, 2);
        assert.equal(metric('2026-11-01', 'page_views'), 1, 'агрегат пережил удаление сырых событий');
        assert.deepEqual(stats.counters(), { visits: 1, users: 1 }, 'визиты и пользователи хранятся всегда');
        dbh.close();
    });
});

describe('ua и время', () => {
    it('узнаёт in-app браузеры и ботов', () => {
        assert.deepEqual(parseUa(IPHONE_INSTAGRAM), { device: 'mobile', os: 'ios', browser: 'other', inapp: 'instagram', isBot: false });
        assert.equal(parseUa(GOOGLEBOT).isBot, true);
        assert.equal(parseUa(DESKTOP_CHROME).device, 'desktop');
        assert.equal(parseUa('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36 YaBrowser/24.1').browser, 'yandex');
    });

    it('соль хэша IP меняется раз в сутки, день — по Москве', () => {
        assert.equal(moscowDay(Date.parse('2026-11-07T21:30:00Z')), '2026-11-08');
        assert.notEqual(hashIp('1.2.3.4', 's', '2026-11-07'), hashIp('1.2.3.4', 's', '2026-11-08'));
        assert.equal(hashIp('1.2.3.4', 's', '2026-11-07'), hashIp('1.2.3.4', 's', '2026-11-07'));
    });
});
