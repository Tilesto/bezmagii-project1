# Сайт челленджа «Сайт через день» (форк заготовки)

Проект — один сайт челленджа блога «Без магИИ». Сделан форком заготовки `apps/blog/template/`
(`tools/new-project.sh`). Код публичный (GitHub), секреты — только в `.env`.

## Стек

- **Фронт** `frontend/`: Vite + React + TypeScript, React Router, TanStack Query, SCSS modules.
- **Бэк** `backend/`: Fastify + TypeBox, SQLite через Drizzle (`better-sqlite3`).
- `project.json` — паспорт проекта (slug, номер, версия, честные цифры), общий для фронта и бэка.

```bash
npm run dev        # фронт :5173 (проксирует /api) + бэк :3000
npm test           # тесты бэка
npm run typecheck
npm run api:gen    # типы API для фронта из схем бэка
npm run db:generate -w backend   # миграция после правки схемы БД
```

## Ядро (`src/core/`) — не трогать в форке без причины

Одинаково во всех сайтах: верхняя полоса челленджа, подвал (счётчики, соцсети, версия,
почта), тема светлая/тёмная, тосты, cookie-баннер, 404 и экран ошибки, «поделиться»,
аудит, OG-превью, `robots.txt`/`sitemap.xml`. Правка ядра — в заготовке, не в форке.

Код проекта: страницы — `frontend/src/pages/`, маршруты — `frontend/src/App.tsx` (и
`project.json → routes` для sitemap), API — плагином в `backend/src/features/<name>/` +
строка в `backend/src/features.ts`, таблицы — `backend/src/db/schema/<name>.ts`.

## Стили — как в cosby

- Файл рядом с компонентом: `Foo.tsx` + `Foo.module.scss`, в модуле `@use 'mixins' as *;`.
- Классы — короткие смысловые kebab-case без БЭМ и префиксов: `.wrapper`, `.price-block`;
  вложенность по разметке; состояние — `&.active`; адаптив — `@include mobile { … }`.
- В TSX — `styles.priceBlock`, склейка через `clsx`.
- Цвета — только переменные из `src/styles/_palette.scss` (две темы), размеры — из
  `_css.variables.scss`. Никаких захардкоженных цветов в модулях.
- Сначала проверять на ширине телефона (390px) и в обеих темах.

## Аудит

Клики, страницы, ошибки, Web Vitals пишутся сами. Осмысленное имя кнопке — `data-audit="…"`.
Своё событие — `track('type', 'name', { … })` из `core/audit/audit.ts` (тип — `[a-z_]`).
На бэке — `app.stats.logServerEvent(...)`. Статистику читать: `POST /api/admin/query` с
`Authorization: Bearer $ADMIN_TOKEN` (только SELECT), сводка — `GET /api/admin/summary`.

## Версии

semver, версия в `project.json`. Любая выкладка — новая версия + запись в `CHANGELOG.md`
(по-русски, для людей): его показывает подвал по клику на версию.
