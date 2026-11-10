import { siteUrl } from '../../core/project';

interface GameFile {
    title: string;
    version: number;
    createdAt: number;
    updatedAt: number;
    html: string;
}

const date = (ts: number) => new Date(ts).toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short' });

/**
 * Игра целиком: она и так один самодостаточный HTML, браузеру больше ничего не нужно.
 * Сверху комментарий «что это», без нашей обвязки-песочницы: файл открывается в любом браузере.
 */
export function gameFileContent(game: GameFile): string {
    const about = [
        `<!--`,
        `  ${game.title.replace(/-{2,}/g, '-')}`,
        `  Версия ${game.version}. Создана ${date(game.createdAt)}, обновлена ${date(game.updatedAt)}.`,
        `  Код написала нейросеть через MCP на ${siteUrl}`,
        `  Чтобы играть, откройте этот файл в браузере. Интернет не нужен.`,
        `-->`,
    ].join('\n');

    // Комментарий после <!doctype>, чтобы не сломать режим отображения.
    const doctype = /^\s*<!doctype[^>]*>/i.exec(game.html);
    if (doctype) return `${doctype[0]}\n${about}\n${game.html.slice(doctype[0].length).replace(/^\n/, '')}`;
    return `${about}\n${game.html}`;
}

/** Имя файла из названия: буквы (и кириллица), цифры, дефисы. */
export function gameFileName(title: string): string {
    const base = title
        .trim()
        .replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
    return `${base || 'igra'}.html`;
}

export function downloadGame(game: GameFile): void {
    // BOM: файл с диска откроется как UTF-8, даже если в игре нет <meta charset>.
    const blob = new Blob(['\uFEFF', gameFileContent(game)], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = gameFileName(game.title);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
