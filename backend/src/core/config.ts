import { resolve } from 'node:path';

export interface Config {
    env: 'production' | 'development' | 'test';
    host: string;
    port: number;
    logLevel: string;
    /** Путь к файлу SQLite. ':memory:' — для тестов. */
    dbPath: string;
    migrationsDir: string;
    projectJsonPath: string;
    /** Токен для /api/admin/* (статистику читает Claude по нему). */
    adminToken: string;
    /** Секрет для хэша IP. Вместе с датой даёт соль, которая меняется раз в сутки. */
    ipHashSecret: string;
    /** Сколько дней хранить сырые события. Дневные агрегаты хранятся всегда. */
    eventsRetentionDays: number;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
    const env = (process.env.NODE_ENV ?? 'development') as Config['env'];
    const cwd = process.cwd();

    const config: Config = {
        env,
        host: process.env.HOST ?? '127.0.0.1',
        port: Number(process.env.PORT ?? 3000),
        logLevel: process.env.LOG_LEVEL ?? (env === 'production' ? 'info' : 'debug'),
        dbPath: process.env.DB_PATH ?? resolve(cwd, 'data/db.sqlite'),
        migrationsDir: process.env.MIGRATIONS_DIR ?? resolve(cwd, 'drizzle'),
        projectJsonPath: process.env.PROJECT_JSON ?? resolve(cwd, '../project.json'),
        adminToken: process.env.ADMIN_TOKEN ?? '',
        ipHashSecret: process.env.IP_HASH_SECRET ?? '',
        eventsRetentionDays: Number(process.env.EVENTS_RETENTION_DAYS ?? 90),
        ...overrides,
    };

    if (config.env === 'production') {
        for (const key of ['adminToken', 'ipHashSecret'] as const) {
            if (config[key].length < 32) {
                throw new Error(`Config: ${key} must be at least 32 chars in production`);
            }
        }
    } else {
        config.adminToken ||= 'dev-admin-token';
        config.ipHashSecret ||= 'dev-ip-hash-secret';
    }

    return config;
}
