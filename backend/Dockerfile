# Бэк проекта: Fastify + better-sqlite3. Собирается под linux/amd64 на маке (deploy.sh)
# и едет на сервер через `docker save | ssh docker load`, без registry.
FROM node:24-bookworm-slim AS build
# better-sqlite3 — нативный модуль; если готовой сборки под платформу нет, компилируется.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
RUN npm ci -w backend --include-workspace-root=false
COPY backend/ backend/
RUN npm run build -w backend && npm prune --omit=dev -w backend

FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DB_PATH=/data/db.sqlite \
    MIGRATIONS_DIR=/app/backend/drizzle \
    PROJECT_JSON=/app/project.json \
    NODE_OPTIONS=--max-old-space-size=64
WORKDIR /app/backend
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/package.json ./
COPY backend/drizzle ./drizzle
COPY project.json /app/project.json
# /data монтируется с хоста (~/bezmagii/<slug>/data); владелец — uid 1000 (node).
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
CMD ["node", "dist/main.js"]
