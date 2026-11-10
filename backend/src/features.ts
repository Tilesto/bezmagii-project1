import type { FastifyPluginAsync } from 'fastify';
import { gamesRoutes } from './features/games/games.routes.js';

// Реестр фич: каждая — Fastify-плагин из src/features/<name>/, монтируется под /api.
// new-project.sh удаляет строки невыбранных фич (метка `// feature:<name>`) вместе с их папками.

export const features: Array<{ name: string; plugin: FastifyPluginAsync }> = [
    { name: 'games', plugin: gamesRoutes as FastifyPluginAsync },
];
