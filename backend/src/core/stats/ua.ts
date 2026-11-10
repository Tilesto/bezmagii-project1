// Разбор User-Agent без внешних библиотек: нам нужно немного — тип устройства, ОС, браузер,
// встроенный браузер приложения (ссылки из шапки профиля открываются именно в нём) и бот ли это.

export interface ParsedUa {
    device: 'mobile' | 'tablet' | 'desktop' | 'bot' | 'unknown';
    os: string;
    browser: string;
    inapp: string | null;
    isBot: boolean;
}

const BOT_RE =
    /bot|crawl|spider|slurp|preview|fetch|monitor|headless|lighthouse|curl|wget|python|httpclient|axios|go-http|java\/|okhttp|scrapy|phantom|facebookexternalhit|vkshare|whatsapp|telegrambot|yandex(?!browser)/i;

const INAPP: Array<[RegExp, string]> = [
    [/Instagram/i, 'instagram'],
    [/musical_ly|TikTok|BytedanceWebview|trill_/i, 'tiktok'],
    [/Telegram/i, 'telegram'],
    [/VKAndroidApp|VKClient|com\.vk|vkontakte/i, 'vk'],
    [/FBAN|FBAV|FB_IAB/i, 'facebook'],
    [/YaApp|YandexSearch/i, 'yandex-app'],
    [/Twitter/i, 'twitter'],
    [/WhatsApp/i, 'whatsapp'],
];

export function parseUa(ua: string | undefined): ParsedUa {
    if (!ua) return { device: 'unknown', os: 'unknown', browser: 'unknown', inapp: null, isBot: false };

    const isBot = BOT_RE.test(ua) && !/Instagram|FBAV|Telegram/i.test(ua);

    let os = 'other';
    if (/iPhone|iPad|iPod/.test(ua)) os = 'ios';
    else if (/Android/.test(ua)) os = 'android';
    else if (/Windows/.test(ua)) os = 'windows';
    else if (/Mac OS X|Macintosh/.test(ua)) os = 'macos';
    else if (/CrOS/.test(ua)) os = 'chromeos';
    else if (/Linux/.test(ua)) os = 'linux';

    let browser = 'other';
    if (/YaBrowser/.test(ua)) browser = 'yandex';
    else if (/Edg\//.test(ua)) browser = 'edge';
    else if (/OPR\/|Opera/.test(ua)) browser = 'opera';
    else if (/SamsungBrowser/.test(ua)) browser = 'samsung';
    else if (/Firefox|FxiOS/.test(ua)) browser = 'firefox';
    else if (/Chrome|CriOS/.test(ua)) browser = 'chrome';
    else if (/Safari/.test(ua)) browser = 'safari';

    let inapp: string | null = null;
    for (const [re, name] of INAPP) {
        if (re.test(ua)) {
            inapp = name;
            break;
        }
    }

    let device: ParsedUa['device'] = 'desktop';
    if (isBot) device = 'bot';
    else if (/iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) device = 'tablet';
    else if (/Mobi|iPhone|iPod|Android/.test(ua)) device = 'mobile';

    return { device, os, browser, inapp, isBot };
}
