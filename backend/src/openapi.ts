// Выгружает OpenAPI-схему бэка в файл, по ней фронт генерирует типы: npm run api:gen
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildApp } from './app.js';

const out = resolve(process.argv[2] ?? '../frontend/src/core/api/openapi.json');
const app = await buildApp({ env: 'test', dbPath: ':memory:' });
await app.ready();
writeFileSync(out, JSON.stringify(app.swagger(), null, 2) + '\n');
await app.close();
console.log(`openapi → ${out}`);
