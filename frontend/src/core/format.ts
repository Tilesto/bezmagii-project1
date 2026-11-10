/** Русские формы множественного числа: plural(5, ['посещение', 'посещения', 'посещений']). */
export function plural(n: number, forms: [string, string, string]): string {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return forms[0];
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
    return forms[2];
}

const numberFormat = new Intl.NumberFormat('ru-RU');

export function formatNumber(n: number): string {
    return numberFormat.format(n);
}

/** 225 → «3 ч 45 мин», 40 → «40 мин». */
export function formatMinutes(total: number): string {
    const h = Math.floor(total / 60);
    const m = Math.round(total % 60);
    if (h === 0) return `${m} мин`;
    return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}
