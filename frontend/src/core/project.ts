import projectJson from '../../../project.json';
import changelogMd from '../../../CHANGELOG.md?raw';

/** Паспорт проекта — общий `project.json` в корне репозитория (его же читает бэк). */
export interface Project {
    slug: string;
    number: number;
    title: string;
    description: string;
    version: string;
    url?: string;
    routes?: string[];
    /** Честные цифры. Показываются, только когда владелец их проверил (`reviewed`). */
    honest: {
        totalMin: number | null;
        activeMin: number | null;
        reviewed: boolean;
    };
}

export const project = projectJson as Project;
export const changelog = changelogMd;
export const siteUrl = (project.url ?? `https://${project.slug}.bezmagii.site`).replace(/\/$/, '');
