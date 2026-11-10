import { createHash, randomBytes } from 'node:crypto';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../core/db.js';
import { gameErrors, games, spaces } from '../../db/schema/games.js';

export const LIMITS = {
    /** Игр на одно пространство. */
    gamesPerSpace: 10,
    /** Размер одной игры, байт. */
    gameBytes: 10 * 1024 * 1024,
    titleChars: 80,
    /** Сколько ошибок храним на игру (последние). */
    errorsPerGame: 30,
    errorChars: 1000,
};

export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export class GameError extends Error {
    constructor(
        readonly code: 'not_found' | 'limit_games' | 'too_big' | 'bad_input' | 'edit_failed',
        message: string,
    ) {
        super(message);
    }
}

export interface GameSummary {
    id: string;
    title: string;
    size: number;
    version: number;
    /** false — игру ещё дописывают частями. */
    complete: boolean;
    parts: number;
    createdAt: number;
    updatedAt: number;
}

export interface Edit {
    old_str: string;
    new_str: string;
}

export interface GameFull extends GameSummary {
    html: string;
}

export function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

const summaryColumns = {
    id: games.id,
    title: games.title,
    size: games.size,
    version: games.version,
    complete: games.complete,
    parts: games.parts,
    createdAt: games.createdAt,
    updatedAt: games.updatedAt,
};

export class GamesService {
    constructor(
        private readonly db: Db,
        private readonly now: () => number = Date.now,
    ) {}

    /** Новое пространство. Токен возвращается один раз, в базе остаётся только хэш. */
    createSpace(): string {
        const token = randomBytes(32).toString('base64url');
        const ts = this.now();
        this.db.insert(spaces).values({ id: hashToken(token), createdAt: ts, seenAt: ts }).run();
        return token;
    }

    /** id пространства по токену или null. Заодно отмечает, что пространством пользуются. */
    resolveSpace(token: string): string | null {
        if (!TOKEN_RE.test(token)) return null;
        const id = hashToken(token);
        const row = this.db.select({ id: spaces.id }).from(spaces).where(eq(spaces.id, id)).get();
        if (!row) return null;
        this.db.update(spaces).set({ seenAt: this.now() }).where(eq(spaces.id, id)).run();
        return id;
    }

    deleteSpace(spaceId: string): void {
        this.db.delete(spaces).where(eq(spaces.id, spaceId)).run();
    }

    list(spaceId: string): GameSummary[] {
        return this.db.select(summaryColumns).from(games).where(eq(games.spaceId, spaceId)).orderBy(desc(games.createdAt)).all();
    }

    count(spaceId: string): number {
        return this.db.select({ n: sql<number>`count(*)` }).from(games).where(eq(games.spaceId, spaceId)).get()?.n ?? 0;
    }

    get(spaceId: string, id: string): GameFull {
        const row = this.db
            .select({ ...summaryColumns, html: games.html })
            .from(games)
            .where(and(eq(games.spaceId, spaceId), eq(games.id, id)))
            .get();
        if (!row) throw new GameError('not_found', `Игры ${id} нет`);
        return row;
    }

    /** complete=false — это первая часть, остальное придёт через append(). */
    create(spaceId: string, title: string, html: string, complete = true): GameSummary {
        const clean = this.validate(title, html);
        if (this.count(spaceId) >= LIMITS.gamesPerSpace) {
            throw new GameError(
                'limit_games',
                `Уже ${LIMITS.gamesPerSpace} игр, это предел. Удалите ненужную (delete_game) или правьте существующую (update_game).`,
            );
        }
        const ts = this.now();
        const row = {
            id: randomBytes(6).toString('base64url'),
            spaceId,
            title: clean.title,
            html,
            size: clean.size,
            version: 1,
            complete,
            parts: 1,
            createdAt: ts,
            updatedAt: ts,
        };
        this.db.insert(games).values(row).run();
        return { id: row.id, title: row.title, size: row.size, version: 1, complete, parts: 1, createdAt: ts, updatedAt: ts };
    }

    /** Заменить код целиком (новая версия). complete=false — дальше дописывать через append(). */
    update(spaceId: string, id: string, html: string, title?: string, complete = true): GameSummary {
        const current = this.get(spaceId, id);
        const clean = this.validate(title ?? current.title, html);
        return this.save(spaceId, current, { title: clean.title, html, size: clean.size, version: current.version + 1, complete, parts: 1 });
    }

    /** Дописать следующую часть в конец кода. Версия та же: игра ещё не запускалась. */
    append(spaceId: string, id: string, chunk: string, complete: boolean): GameSummary {
        const current = this.get(spaceId, id);
        if (current.complete) {
            throw new GameError(
                'bad_input',
                `Игра ${id} уже дописана. Чтобы дописать заново: update_game с complete=false, потом append_game. Для правок есть edit_game.`,
            );
        }
        if (!chunk) throw new GameError('bad_input', 'Пустая часть');
        const html = current.html + chunk;
        const size = this.checkSize(html);
        return this.save(spaceId, current, { title: current.title, html, size, version: current.version, complete, parts: current.parts + 1 });
    }

    /**
     * Точечные правки: каждый old_str должен встречаться в коде ровно один раз. Применяются по
     * порядку, все или ни одной. Новая версия — вкладка перезапустит игру.
     */
    edit(spaceId: string, id: string, edits: Edit[]): GameSummary {
        const current = this.get(spaceId, id);
        if (!edits.length) throw new GameError('bad_input', 'Нет правок');
        let html = current.html;
        edits.forEach((e, i) => {
            const n = i + 1;
            if (typeof e?.old_str !== 'string' || typeof e?.new_str !== 'string' || !e.old_str) {
                throw new GameError('bad_input', `Правка ${n}: нужны строки old_str (не пустая) и new_str`);
            }
            const first = html.indexOf(e.old_str);
            if (first === -1) {
                throw new GameError('edit_failed', `Правка ${n}: old_str не найден в коде (версия ${current.version}). Ничего не изменено. Сверь текст через get_game.`);
            }
            if (html.indexOf(e.old_str, first + 1) !== -1) {
                throw new GameError('edit_failed', `Правка ${n}: old_str встречается больше одного раза. Добавь соседние строки, чтобы фрагмент был уникальным. Ничего не изменено.`);
            }
            html = html.slice(0, first) + e.new_str + html.slice(first + e.old_str.length);
        });
        const size = this.checkSize(html);
        return this.save(spaceId, current, { title: current.title, html, size, version: current.version + 1, complete: current.complete, parts: current.parts });
    }

    private save(
        spaceId: string,
        current: GameFull,
        next: { title: string; html: string; size: number; version: number; complete: boolean; parts: number },
    ): GameSummary {
        const ts = this.now();
        this.db
            .update(games)
            .set({ ...next, updatedAt: ts })
            .where(and(eq(games.spaceId, spaceId), eq(games.id, current.id)))
            .run();
        const { html: _html, ...rest } = next;
        return { id: current.id, createdAt: current.createdAt, updatedAt: ts, ...rest };
    }

    delete(spaceId: string, id: string): void {
        const result = this.db.delete(games).where(and(eq(games.spaceId, spaceId), eq(games.id, id))).run();
        if (result.changes === 0) throw new GameError('not_found', `Игры ${id} нет`);
    }

    /** Вкладка запустила игру (version) и, возможно, поймала ошибки. */
    report(spaceId: string, id: string, version: number, messages: string[]): void {
        const game = this.get(spaceId, id);
        if (version !== game.version) return; // устаревшая вкладка
        const ts = this.now();
        this.db.update(games).set({ openedVersion: version, openedAt: ts }).where(eq(games.id, id)).run();
        if (!messages.length) return;
        this.db
            .insert(gameErrors)
            .values(messages.map((m) => ({ gameId: id, version, ts, message: m.slice(0, LIMITS.errorChars) })))
            .run();
        // Храним только последние N.
        this.db.run(sql`
            delete from game_errors where game_id = ${id} and id not in (
                select id from game_errors where game_id = ${id} order by id desc limit ${LIMITS.errorsPerGame}
            )`);
    }

    /** Ошибки текущей версии и проверялась ли она во вкладке. */
    errors(spaceId: string, id: string) {
        const game = this.get(spaceId, id);
        const meta = this.db
            .select({ openedVersion: games.openedVersion, openedAt: games.openedAt })
            .from(games)
            .where(eq(games.id, id))
            .get();
        const list = this.db
            .select({ ts: gameErrors.ts, message: gameErrors.message })
            .from(gameErrors)
            .where(and(eq(gameErrors.gameId, id), eq(gameErrors.version, game.version)))
            .orderBy(asc(gameErrors.id))
            .all();
        return {
            version: game.version,
            opened: meta?.openedVersion === game.version,
            openedAt: meta?.openedVersion === game.version ? (meta.openedAt ?? null) : null,
            errors: list,
        };
    }

    private validate(title: string, html: string): { title: string; size: number } {
        const t = title.trim().replace(/\s+/g, ' ').slice(0, LIMITS.titleChars);
        if (!t) throw new GameError('bad_input', 'Нужно название игры');
        if (!html.trim()) throw new GameError('bad_input', 'Пустой html');
        return { title: t, size: this.checkSize(html) };
    }

    private checkSize(html: string): number {
        const size = Buffer.byteLength(html, 'utf8');
        if (size > LIMITS.gameBytes) {
            throw new GameError('too_big', `Игра весит ${(size / 1048576).toFixed(1)} МБ, предел 10 МБ. Ничего не изменено.`);
        }
        return size;
    }
}
