import { defineConfig } from 'drizzle-kit';

// Схема лежит по файлу на фичу: src/db/schema/core.ts, auth.ts, …
// Миграции генерируются в форке, после выключения ненужных фич: npm run db:generate
export default defineConfig({
    dialect: 'sqlite',
    schema: './src/db/schema',
    out: './drizzle',
});
