import { readFileSync } from 'node:fs';

/** Общий для фронта и бэка паспорт проекта — `project.json` в корне репозитория. */
export interface ProjectInfo {
    slug: string;
    number: number;
    title: string;
    version: string;
}

export function readProject(path: string): ProjectInfo {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<ProjectInfo>;
    return {
        slug: raw.slug ?? 'unknown',
        number: raw.number ?? 0,
        title: raw.title ?? '',
        version: raw.version ?? '0.0.0',
    };
}
