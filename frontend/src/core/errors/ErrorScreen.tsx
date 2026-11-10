import type { ReactNode } from 'react';
import { BLOG } from '../blog';
import styles from './ErrorScreen.module.scss';

export function ErrorScreen({ code, title, text, action }: { code?: string; title: string; text: string; action?: ReactNode }) {
    return (
        <section className={styles.screen}>
            {code && <p className={styles.code}>{code}</p>}
            <h1 className={styles.title}>{title}</h1>
            <p className={styles.text}>{text}</p>
            <div className={styles.actions}>
                {action}
                <a className={styles.link} href={BLOG.catalogUrl}>
                    Все сайты челленджа
                </a>
            </div>
        </section>
    );
}
