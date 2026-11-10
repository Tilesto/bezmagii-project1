import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../core/api/client';
import { useToast } from '../core/toast/toast';
import { GamePlayer } from '../features/games/GamePlayer';
import { authHeaders } from '../features/games/space';
import { useGames, useOpenNewGames } from '../features/games/useGames';
import styles from './PlayPage.module.scss';

export function PlayPage() {
    const { id = '' } = useParams();
    const { token, data: list } = useGames();
    const navigate = useNavigate();
    const toast = useToast();
    const queryClient = useQueryClient();
    useOpenNewGames(list?.games, id);

    const summary = list?.games.find((g) => g.id === id);
    // Версия из списка (он обновляется раз в 2,5 с): поменялась — тянем новый код, игра перезапускается.
    const game = useQuery({
        queryKey: ['game', token, id, summary?.version],
        enabled: !!token && !!summary,
        staleTime: Infinity,
        queryFn: async () => {
            const { data, response } = await api.GET('/api/games/{id}', { params: { path: { id } }, headers: authHeaders(token!) });
            if (!data) throw new Error(`HTTP ${response.status}`);
            return data;
        },
    });

    if (!token) {
        return (
            <article className={styles.page}>
                <h1 className={styles.title}>Игра не найдена</h1>
                <p className={styles.muted}>Игры видит только тот, кто их сделал, в своём браузере.</p>
                <Link to="/" className={styles.back}>
                    На главную
                </Link>
            </article>
        );
    }

    if (list && !summary) {
        return (
            <article className={styles.page}>
                <h1 className={styles.title}>Игры нет</h1>
                <p className={styles.muted}>Её удалили, или она сделана с другим адресом MCP.</p>
                <Link to="/" className={styles.back}>
                    Мои игры
                </Link>
            </article>
        );
    }

    const remove = async () => {
        if (!window.confirm('Удалить игру насовсем?')) return;
        const { response } = await api.DELETE('/api/games/{id}', { params: { path: { id } }, headers: authHeaders(token) });
        if (!response.ok) return toast.show('Не получилось удалить', 'error');
        await queryClient.invalidateQueries({ queryKey: ['games'] });
        toast.show('Игра удалена', 'success');
        navigate('/');
    };

    return (
        <article className={styles.page}>
            <div className={styles.head}>
                <Link to="/" className={styles.back} data-audit="back">
                    ← Мои игры
                </Link>
                <h1 className={styles.title}>{summary?.title ?? ' '}</h1>
                {summary && <span className={styles.version}>v{summary.version}</span>}
            </div>

            {game.data ? (
                <GamePlayer
                    token={token}
                    id={id}
                    version={game.data.version}
                    html={game.data.html}
                    title={game.data.title}
                    createdAt={game.data.createdAt}
                    updatedAt={game.data.updatedAt}
                />
            ) : (
                <div className={styles.placeholder}>{game.isError ? 'Не получилось загрузить игру' : 'Загружаю…'}</div>
            )}

            <div>
                <button type="button" className={styles.delete} onClick={remove} data-audit="delete-game">
                    Удалить игру
                </button>
            </div>
        </article>
    );
}
