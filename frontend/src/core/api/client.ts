import createClient from 'openapi-fetch';
import type { paths } from './schema';

// Типизированный клиент API этого сайта. Типы — из Swagger бэка: npm run api:gen
export const api = createClient<paths>({ baseUrl: '' });
