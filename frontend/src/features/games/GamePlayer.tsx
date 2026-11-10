import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../core/api/client';
import { authHeaders } from './space';
import { buildSrcdoc, isGameErrorMessage } from './srcdoc';
import styles from './GamePlayer.module.scss';

interface Props {
    token: string;
    id: string;
    version: number;
    html: string;
    title: string;
}

/** Игра в изолированном iframe. Сообщает серверу, что версия запущена, и пересылает её ошибки. */
export function GamePlayer({ token, id, version, html, title }: Props) {
    const frame = useRef<HTMLIFrameElement>(null);
    const box = useRef<HTMLDivElement>(null);
    const [run, setRun] = useState(0);
    const srcdoc = useMemo(() => buildSrcdoc(html), [html]);

    useEffect(() => {
        const queue: string[] = [];
        const seen = new Set<string>();
        let timer: number | undefined;
        let sent = 0;

        const flush = () => {
            timer = undefined;
            const errors = queue.splice(0, 20);
            void api.POST('/api/games/{id}/report', { params: { path: { id } }, body: { version, errors }, headers: authHeaders(token) });
        };

        const onMessage = (e: MessageEvent) => {
            if (e.source !== frame.current?.contentWindow || !isGameErrorMessage(e.data)) return;
            if (seen.has(e.data.message) || sent >= 50) return; // одна и та же ошибка в цикле игры — один раз
            seen.add(e.data.message);
            sent++;
            queue.push(e.data.message);
            timer ??= window.setTimeout(flush, 800);
        };
        window.addEventListener('message', onMessage);

        // Версия запущена — даже если ошибок не будет, нейросеть узнает, что игру открывали.
        const opened = window.setTimeout(() => {
            if (!queue.length && timer === undefined) flush();
        }, 1500);

        return () => {
            window.removeEventListener('message', onMessage);
            window.clearTimeout(opened);
            if (timer !== undefined) {
                window.clearTimeout(timer);
                flush();
            }
        };
    }, [id, version, token, run]);

    const fullscreen = () => {
        const el = box.current;
        if (!el) return;
        if (document.fullscreenElement) void document.exitFullscreen();
        else void el.requestFullscreen?.().catch(() => undefined);
    };

    return (
        <div className={styles.player}>
            <div className={styles.frame} ref={box}>
                <iframe
                    key={`${version}-${run}`}
                    ref={frame}
                    title={title}
                    srcDoc={srcdoc}
                    sandbox="allow-scripts allow-pointer-lock"
                    allow="autoplay; gamepad"
                    onLoad={() => frame.current?.focus()}
                />
            </div>
            <div className={styles.controls}>
                <button type="button" className={styles.button} onClick={() => setRun((n) => n + 1)} data-audit="game-restart">
                    Перезапустить
                </button>
                <button type="button" className={styles.button} onClick={fullscreen} data-audit="game-fullscreen">
                    На весь экран
                </button>
            </div>
        </div>
    );
}
