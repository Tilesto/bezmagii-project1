import prompts from './prompts.json';

// Примеры игр: их сделал автор сайта для ролика про этот проект (plan/19-project-01-games.md в блоге).
// Код игр — как их сохранила нейросеть (games/*.html), промпты — дословно (prompts.json).
// Игры открыты всем: это не пользовательские игры, модерация им не нужна.

export interface Example {
    slug: keyof typeof prompts;
    title: string;
    /** Откуда идея: ник из комментариев или «проверка». */
    idea: string;
    /** Сколько нейросеть делала игру. */
    time: string;
    /** Превью в public/examples/. */
    image: string;
    prompts: string[];
}

const list: Omit<Example, 'prompts' | 'image'>[] = [
    { slug: 'neon-tail', title: 'Неоновый хвост: крыша', idea: 'жанр Katana Zero', time: '6 мин + 2 мин' },
    { slug: 'board-games', title: 'Настолки за одним столом', idea: '@idkiloveduck', time: '14,5 мин' },
    { slug: 'spy', title: 'Кто шпион?', idea: '@bildmap-u6s', time: '6 мин' },
    { slug: 'rolling-cube', title: 'Катящийся кубик в 3D', idea: 'проверка 3D', time: '3 мин 20 с' },
    { slug: 'snake', title: 'Змейка', idea: 'проверка сайта', time: '45 с' },
];

export const EXAMPLES: Example[] = list.map((e) => ({ ...e, image: `/examples/${e.slug}.jpg`, prompts: prompts[e.slug] }));

export const findExample = (slug: string) => EXAMPLES.find((e) => e.slug === slug);

// Код игры подгружается только на её странице: на главной он не нужен.
const sources = import.meta.glob<string>('./games/*.html', { query: '?raw', import: 'default' });

export async function loadExample(slug: string): Promise<string> {
    const load = sources[`./games/${slug}.html`];
    if (!load) throw new Error('Нет такой игры');
    return load();
}
