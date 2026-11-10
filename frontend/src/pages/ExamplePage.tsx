import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { NotFoundPage } from '../core/errors/NotFoundPage';
import { findExample, loadExample } from '../features/examples/examples';
import { PromptBlock } from '../features/examples/PromptBlock';
import { GamePlayer } from '../features/games/GamePlayer';
import styles from './ExamplePage.module.scss';

// Даты для файла «Скачать игру»: день, когда игры делались для ролика.
const MADE_AT = Date.UTC(2026, 10, 10, 9);

/** Пример игры: открыт всем, без пространства и MCP. */
export function ExamplePage() {
    const { slug = '' } = useParams();
    const example = findExample(slug);
    const html = useQuery({
        queryKey: ['example', slug],
        enabled: !!example,
        staleTime: Infinity,
        queryFn: () => loadExample(slug),
    });

    if (!example) return <NotFoundPage />;

    return (
        <article className={styles.page}>
            <div className={styles.head}>
                <Link to="/#examples" className={styles.back} data-audit="back-examples">
                    ← Все примеры
                </Link>
                <h1 className={styles.title}>{example.title}</h1>
            </div>
            <p className={styles.meta}>
                <span className={styles.chip}>⏱ {example.time}</span>
                <span className={styles.idea}>идея: {example.idea}</span>
            </p>

            {html.data ? (
                <GamePlayer version={1} html={html.data} title={example.title} createdAt={MADE_AT} updatedAt={MADE_AT} />
            ) : (
                <div className={styles.placeholder}>{html.isError ? 'Не получилось загрузить игру' : 'Загружаю…'}</div>
            )}

            <PromptBlock prompts={example.prompts} />
        </article>
    );
}
