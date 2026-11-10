import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

export type Db = BetterSQLite3Database;

export interface DbHandle {
    db: Db;
    sqlite: Database.Database;
    /** Отдельное соединение только на чтение — для /api/admin/query. */
    readonly: Database.Database;
    close(): void;
}

export function openDb(path: string, migrationsDir: string): DbHandle {
    const memory = path === ':memory:';
    if (!memory) mkdirSync(dirname(path), { recursive: true });

    const sqlite = new Database(path);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('synchronous = NORMAL');
    sqlite.pragma('foreign_keys = ON');
    sqlite.pragma('busy_timeout = 5000');

    const db = drizzle({ client: sqlite });
    migrate(db, { migrationsFolder: migrationsDir });

    // Для :memory: второе соединение увидело бы пустую базу — читаем из основного.
    const readonly = memory ? sqlite : new Database(path, { readonly: true, fileMustExist: true });
    if (!memory) readonly.pragma('busy_timeout = 5000');

    return {
        db,
        sqlite,
        readonly,
        close() {
            if (readonly !== sqlite) readonly.close();
            sqlite.close();
        },
    };
}
