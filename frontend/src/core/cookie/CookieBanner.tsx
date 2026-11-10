import { useState } from 'react';
import { BLOG } from '../blog';
import { storageGet, storageSet } from '../storage';
import styles from './CookieBanner.module.scss';

// Как в cosby (cosby/agreements/05-cookie-banner.md): полоска снизу, не блокирует контент,
// одна кнопка «Хорошо», показывается один раз. Текст адаптирован: Метрики нет, своя статистика.
const KEY = 'cookieNoticeAccepted';

export function CookieBanner() {
    const [visible, setVisible] = useState(() => storageGet(KEY) !== '1');
    if (!visible) return null;

    const accept = () => {
        storageSet(KEY, '1');
        setVisible(false);
    };

    return (
        <div className={styles.banner} role="region" aria-label="Уведомление о cookie">
            <p className={styles.text}>
                Сайт использует cookie и хранилище браузера: они нужны для работы сайта и для обезличенной статистики
                посещений. Оставаясь на сайте, вы соглашаетесь с{' '}
                <a href={BLOG.privacyUrl} target="_blank" rel="noopener">
                    политикой обработки данных
                </a>
                .
            </p>
            <button type="button" className={styles.button} onClick={accept} data-audit="cookie-accept">
                Хорошо
            </button>
        </div>
    );
}
