import { useQuery } from '@tanstack/react-query';
import { BLOG, type Platform } from '../blog';
import { project } from '../project';

// Реестр проектов (bezmagii.site/projects.json): по нему строится каталог, а полоса берёт оттуда
// ссылки на ролики про этот сайт. Ролик выходит позже сайта — ссылки дописываются в реестр
// без пересборки.

export interface RegistryProject {
    slug: string;
    number: number;
    title: string;
    url: string;
    videos?: Partial<Record<Platform, string>>;
}

export interface Registry {
    profiles?: Partial<Record<Platform, string>>;
    projects?: RegistryProject[];
}

export function useRegistry() {
    return useQuery({
        queryKey: ['registry'],
        queryFn: async (): Promise<Registry> => {
            const res = await fetch(BLOG.registryUrl, { cache: 'no-cache' });
            if (!res.ok) throw new Error(`registry ${res.status}`);
            return (await res.json()) as Registry;
        },
        staleTime: 5 * 60 * 1000,
        retry: 1,
    });
}

/** Ссылки для полосы: ролики про этот сайт, а где ролика ещё нет — профиль площадки. */
export function useBarLinks() {
    const { data } = useRegistry();
    const profiles = { ...BLOG.profiles, ...data?.profiles };
    const videos = data?.projects?.find((p) => p.slug === project.slug)?.videos ?? {};
    return {
        links: { ...profiles, ...videos } as Partial<Record<Platform, string>>,
        videos,
        profiles,
    };
}
