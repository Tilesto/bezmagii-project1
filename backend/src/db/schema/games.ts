import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Игры, которые нейросеть пользователя создаёт через MCP. Аккаунтов нет: всё привязано к
// «пространству» — случайному токену, который живёт в браузере пользователя и в адресе MCP.

/** Пространство пользователя. В базе только хэш токена: по базе токен не восстановить. */
export const spaces = sqliteTable('spaces', {
    /** sha256(токен), hex. */
    id: text('id').primaryKey(),
    createdAt: integer('created_at').notNull(),
    /** Последнее обращение (сайт или MCP), мс. */
    seenAt: integer('seen_at').notNull(),
});

export const games = sqliteTable(
    'games',
    {
        id: text('id').primaryKey(),
        spaceId: text('space_id')
            .notNull()
            .references(() => spaces.id, { onDelete: 'cascade' }),
        title: text('title').notNull(),
        html: text('html').notNull(),
        /** Размер html в байтах (UTF-8). */
        size: integer('size').notNull(),
        /** false — нейросеть ещё дописывает игру частями (append_game), вкладка показывает прогресс. */
        complete: integer('complete', { mode: 'boolean' }).notNull().default(true),
        /** Сколько частей прислано для текущей версии. */
        parts: integer('parts').notNull().default(1),
        /** Растёт при каждой правке: вкладка перезапускает игру, ошибки старых версий не путаются. */
        version: integer('version').notNull().default(1),
        createdAt: integer('created_at').notNull(),
        updatedAt: integer('updated_at').notNull(),
        /** Какая версия последней запускалась во вкладке и когда: get_errors говорит, проверена ли правка. */
        openedVersion: integer('opened_version'),
        openedAt: integer('opened_at'),
    },
    (t) => [index('games_space_idx').on(t.spaceId, t.createdAt)],
);

/** Ошибки JS из запущенной во вкладке игры — их читает нейросеть через get_errors. */
export const gameErrors = sqliteTable(
    'game_errors',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        gameId: text('game_id')
            .notNull()
            .references(() => games.id, { onDelete: 'cascade' }),
        version: integer('version').notNull(),
        ts: integer('ts').notNull(),
        message: text('message').notNull(),
    },
    (t) => [index('game_errors_game_idx').on(t.gameId, t.id)],
);
