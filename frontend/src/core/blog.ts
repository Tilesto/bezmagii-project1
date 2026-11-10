// Общие для всех сайтов данные блога «Без магИИ». Меняются здесь, в заготовке.

export type Platform = 'youtube' | 'instagram' | 'tiktok' | 'vk' | 'rutube' | 'telegram';

export const PLATFORM_LABELS: Record<Platform, string> = {
    youtube: 'YouTube',
    instagram: 'Instagram',
    tiktok: 'TikTok',
    vk: 'VK',
    rutube: 'Rutube',
    telegram: 'Telegram',
};

/** Порядок иконок в полосе и подвале. */
export const PLATFORMS: Platform[] = ['youtube', 'instagram', 'tiktok', 'vk', 'rutube', 'telegram'];

export const BLOG = {
    name: 'Без магИИ',
    challenge: 'Сайт через день',
    catalogUrl: 'https://bezmagii.site',
    privacyUrl: 'https://bezmagii.site/legal/privacy',
    /** Реестр проектов: ссылки на ролики появляются после публикации, без пересборки сайтов. */
    registryUrl: import.meta.env.VITE_REGISTRY_URL ?? 'https://bezmagii.site/projects.json',
    /**
     * Профили блога — запасной вариант, если реестр недоступен.
     * TODO(owner): Telegram — дописать, когда появится канал.
     */
    profiles: {
        youtube: 'https://www.youtube.com/channel/UCz04Vn1US1vD2vCdWLoJO2w',
        instagram: 'https://www.instagram.com/bezmag.ii/',
        tiktok: 'https://www.tiktok.com/@bez.magii',
        vk: 'https://vk.com/id200007502281',
        rutube: 'https://rutube.ru/channel/82898346/',
    } as Partial<Record<Platform, string>>,
    /** Реквизиты — как в cosby (ст. 26.1 ЗПП, политика ПД). */
    requisites: {
        name: 'Петросян Тигран Ашотович',
        status: 'плательщик НПД',
        inn: '020205520740',
        email: 'bezmagii.blog@gmail.com',
    },
};
