import { useState } from 'react';
import { BLOG, PLATFORM_LABELS, PLATFORMS } from '../blog';
import { ChangelogDialog } from '../changelog/ChangelogDialog';
import { formatMinutes, formatNumber, plural } from '../format';
import { Icon } from '../icons/Icon';
import { SocialIcon } from '../icons/SocialIcon';
import { project } from '../project';
import { useCounters } from '../stats/useCounters';
import { useBarLinks } from '../topbar/registry';
import styles from './Footer.module.scss';

/** Одинаковый во всех сайтах подвал: счётчики, профили блога, честные цифры, версия, документы, почта. */
export function Footer() {
    const { profiles } = useBarLinks();
    const counters = useCounters();
    const [changelogOpen, setChangelogOpen] = useState(false);
    const { honest } = project;
    const { email } = BLOG.requisites;

    return (
        <footer className={styles.footer}>
            <div className={styles.inner}>
                <div className={styles.row}>
                    {counters.data && (
                        <p className={styles.counters}>
                            <span className={styles.counter} title="Посещения: повторный заход в течение 30 минут не считается">
                                <Icon name="eye" className={styles.counterIcon} />
                                {formatNumber(counters.data.visits)} {plural(counters.data.visits, ['посещение', 'посещения', 'посещений'])}
                            </span>
                            <span className={styles.counter} title="Уникальные посетители">
                                <Icon name="user" className={styles.counterIcon} />
                                {formatNumber(counters.data.users)} {plural(counters.data.users, ['пользователь', 'пользователя', 'пользователей'])}
                            </span>
                        </p>
                    )}
                    <nav className={styles.socials} aria-label="Без магИИ в соцсетях">
                        {PLATFORMS.filter((p) => profiles[p]).map((p) => (
                            <a
                                key={p}
                                className={styles.social}
                                href={profiles[p]}
                                target="_blank"
                                rel="noopener"
                                aria-label={`Без магИИ в ${PLATFORM_LABELS[p]}`}
                                data-audit={`footer-${p}`}
                            >
                                <SocialIcon platform={p} className={styles.socialIcon} />
                            </a>
                        ))}
                    </nav>
                </div>

                {honest.reviewed && honest.totalMin !== null && (
                    <p className={styles.honest}>
                        Сделано за {formatMinutes(honest.totalMin)}
                        {honest.activeMin !== null && <> · активно {formatMinutes(honest.activeMin)}</>}
                    </p>
                )}

                <p className={styles.links}>
                    {/* в каталоге — просто прокрутка к списку, на остальных сайтах — сразу к нему же */}
                    <a href={project.number === 0 ? '#sites' : `${BLOG.catalogUrl}/#sites`} data-audit="footer-catalog">
                        Все сайты челленджа
                    </a>
                    <a href={BLOG.privacyUrl} target="_blank" rel="noopener" data-audit="footer-privacy">
                        Политика обработки данных
                    </a>
                    <button type="button" className={styles.version} onClick={() => setChangelogOpen(true)} data-audit="footer-version">
                        v{project.version}
                    </button>
                </p>

                {/* Оплату сайты не принимают, поэтому реквизиты не нужны: они есть в политике ПД, тут только почта. */}
                <p className={styles.contact}>
                    <a href={`mailto:${email}`}>{email}</a>
                </p>
            </div>
            <ChangelogDialog open={changelogOpen} onClose={() => setChangelogOpen(false)} />
        </footer>
    );
}
