import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api } from '../core/api/client';
import { project } from '../core/project';
import { useToast } from '../core/toast/toast';
import { CopyField } from '../features/games/CopyField';
import { authHeaders, checkToken, mcpUrl, parseToken, setToken, useCreateSpace } from '../features/games/space';
import { useGames, useOpenNewGames } from '../features/games/useGames';
import styles from './HomePage.module.scss';

/** Имя MCP-сервера в Claude Code. Инструменты там будут mcp__bezmagii_project1_mcp__*. */
const SERVER_NAME = 'bezmagii_project1_mcp';

const kb = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} КБ` : `${(bytes / 1048576).toFixed(1)} МБ`);
const time = (ts: number) =>
    new Date(ts).toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });

// Последнее слово заголовка — под маркером, как «через день» в каталоге. Короткий предлог
// перед ним («по запросу») идёт вместе со словом, чтобы не висел в конце строки.
const words = project.title.trim().split(/\s+/);
const tail = words.length > 2 && (words[words.length - 2]?.length ?? 0) <= 2 ? 2 : 1;
const last = words.splice(-tail).join(' ');
const head = words.join(' ');

export function HomePage() {
    const { token, data, isPending } = useGames();
    useOpenNewGames(data?.games);

    return (
        <article className={styles.page}>
            <header className={styles.hero}>
                <h1 className={styles.title}>
                    {head} <span className={styles.marker}>{last}</span>
                </h1>
                <p className={styles.lead}>
                    Подключите свою нейросеть к этому сайту по MCP и попросите игру. Через несколько секунд она появится здесь. Игры видите
                    только вы.
                </p>
            </header>

            {token ? <Connected token={token} /> : <Start />}

            {token && (
                <section className={styles.section}>
                    <h2 className={styles.h2}>
                        Мои игры
                        {data && (
                            <span className={styles.count}>
                                {data.games.length} из {data.limits.games}
                            </span>
                        )}
                    </h2>
                    {isPending && <p className={styles.muted}>Загружаю…</p>}
                    {data && data.games.length === 0 && (
                        <p className={styles.empty}>
                            Пока пусто. Как только нейросеть сохранит игру, она откроется здесь сама, страницу обновлять не нужно.
                        </p>
                    )}
                    {data && data.games.length > 0 && (
                        <ul className={styles.games}>
                            {data.games.map((g) => (
                                <li key={g.id}>
                                    <Link to={`/play/${g.id}`} className={styles.game} data-audit="open-game">
                                        <span className={styles.gameTitle}>
                                            {g.title}
                                            {!g.complete && <span className={styles.writing}>пишется</span>}
                                        </span>
                                        <span className={styles.gameMeta}>
                                            версия {g.version} · {kb(g.size)} · {time(g.updatedAt)}
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}

            <section className={styles.section}>
                <h2 className={styles.h2}>Что важно знать</h2>
                <ul className={styles.notes}>
                    <li>
                        Сайт бесплатный, а нейросеть ваша. Claude Code работает по платной подписке Claude, из России напрямую он
                        недоступен.
                    </li>
                    <li>
                        Игры хранятся на сервере сайта. Аккаунтов нет: кто знает ваш адрес MCP, тот видит и меняет игры. Потеряете адрес,
                        игры не вернуть.
                    </li>
                    <li>Игра запускается в изолированной рамке. Она не видит сайт, ваши данные и интернет.</li>
                    <li>Нейросеть видит ошибки игры из вашего браузера, чтобы их исправить. Больше сайт ей ничего не передаёт.</li>
                    <li>До 10 игр, каждая до 10 МБ.</li>
                </ul>
            </section>

            {token && <Danger token={token} />}
        </article>
    );
}

function Start() {
    const createSpace = useCreateSpace();
    const toast = useToast();
    const [busy, setBusy] = useState(false);

    const start = async () => {
        setBusy(true);
        try {
            await createSpace();
        } catch (e) {
            toast.show((e as Error).message, 'error');
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className={styles.section}>
            <h2 className={styles.h2}>Как начать</h2>
            <ol className={styles.steps}>
                <li>Получите свой адрес MCP.</li>
                <li>Добавьте его в Claude Code одной командой.</li>
                <li>Попросите игру. Она откроется на этой странице.</li>
            </ol>
            <button type="button" className={styles.primary} onClick={start} disabled={busy} data-audit="get-address">
                {busy ? 'Секунду…' : 'Получить адрес'}
            </button>
            <Restore />
        </section>
    );
}

function Connected({ token }: { token: string }) {
    const url = mcpUrl(token);
    return (
        <section className={styles.section}>
            <h2 className={styles.h2}>Подключение</h2>
            <div className={styles.connect}>
                <CopyField
                    label="Команда для Claude Code (выполните в терминале)"
                    value={`claude mcp add --scope user --transport http ${SERVER_NAME} ${url}`}
                    audit="copy-command"
                    secret
                />
                <CopyField label="Адрес MCP для других клиентов (тип HTTP)" value={url} audit="copy-url" secret />
                <p className={styles.hint}>
                    Потом запустите Claude Code и напишите, например: <q>Сделай через {SERVER_NAME} игру: змейка с управлением свайпами</q>.
                </p>
                <p className={styles.muted}>
                    Адрес работает как пароль, он размыт на случай записи экрана. Сохраните его, чтобы открыть игры на другом устройстве.
                </p>
            </div>
        </section>
    );
}

function Restore() {
    const toast = useToast();
    const [value, setValue] = useState('');

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        const token = parseToken(value);
        if (!token) return toast.show('Это не похоже на адрес MCP этого сайта', 'error');
        if (!(await checkToken(token))) return toast.show('Такого адреса нет: возможно, игры удалены', 'error');
        setToken(token);
        toast.show('Игры открыты', 'success');
    };

    return (
        <form className={styles.restore} onSubmit={submit}>
            <label className={styles.muted} htmlFor="restore">
                Уже есть адрес? Вставьте его, чтобы открыть свои игры.
            </label>
            <div className={styles.restoreRow}>
                <input
                    id="restore"
                    className={styles.input}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={mcpUrl('…')}
                    autoComplete="off"
                />
                <button type="submit" className={styles.secondary} data-audit="restore">
                    Открыть
                </button>
            </div>
        </form>
    );
}

function Danger({ token }: { token: string }) {
    const toast = useToast();

    const wipe = async () => {
        if (!window.confirm('Удалить все игры и адрес MCP? Вернуть их не получится.')) return;
        const { response } = await api.DELETE('/api/space', {
            headers: authHeaders(token),
        });
        if (!response.ok) return toast.show('Не получилось удалить, попробуйте ещё раз', 'error');
        setToken(null);
        toast.show('Всё удалено', 'success');
    };

    const forget = () => {
        if (
            !window.confirm(
                'Забыть адрес в этом браузере? Игры останутся на сервере, открыть их можно будет только по сохранённому адресу.',
            )
        )
            return;
        setToken(null);
    };

    return (
        <section className={styles.danger}>
            <button type="button" className={styles.secondary} onClick={forget} data-audit="forget">
                Выйти из этого браузера
            </button>
            <button type="button" className={styles.dangerButton} onClick={wipe} data-audit="wipe">
                Удалить все игры и адрес
            </button>
        </section>
    );
}
