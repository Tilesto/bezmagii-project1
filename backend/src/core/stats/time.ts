import { createHash } from 'node:crypto';

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

/** День по Москве в формате YYYY-MM-DD: аудитория в РФ, сутки считаем по МСК. */
export function moscowDay(ts: number): string {
    return dayFormatter.format(new Date(ts));
}

/** Хэш IP с солью, которая меняется раз в сутки: внутри дня уникальных посчитать можно, человека — нет. */
export function hashIp(ip: string | undefined, secret: string, day: string): string | null {
    if (!ip) return null;
    return createHash('sha256').update(`${secret}:${day}:${ip}`).digest('base64url').slice(0, 16);
}
