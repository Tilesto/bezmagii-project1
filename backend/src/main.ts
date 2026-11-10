import { buildApp } from './app.js';

const MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000;

const app = await buildApp();

// Дневные агрегаты + удаление старых сырых событий: при старте и раз в час.
const maintain = () => {
    try {
        const result = app.stats.maintain();
        app.log.info(result, 'stats maintenance');
    } catch (error) {
        app.log.error({ err: error }, 'stats maintenance failed');
    }
};
maintain();
setInterval(maintain, MAINTENANCE_INTERVAL_MS).unref();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, async () => {
        app.log.info({ signal }, 'shutting down');
        await app.close();
        process.exit(0);
    });
}

await app.listen({ host: app.config.host, port: app.config.port });
