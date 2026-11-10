import { BLOG, PLATFORM_LABELS, PLATFORMS } from '../blog';
import { SocialIcon } from '../icons/SocialIcon';
import { project } from '../project';
import { ThemeToggle } from '../theme/ThemeToggle';
import { useBarLinks } from './registry';
import styles from './TopBar.module.scss';

/** Узкая полоса челленджа над каждым сайтом: номер, ролики про этот сайт (или профили блога), тема. */
export function TopBar() {
    const { links, videos } = useBarLinks();

    return (
        <div className={styles.bar}>
            <div className={styles.inner}>
                <a className={styles.title} href={BLOG.catalogUrl} data-audit="topbar-catalog">
                    <span className={styles.challenge}>
                        {BLOG.challenge}
                        {project.number > 0 && <span className={styles.number}> #{project.number}</span>}
                    </span>
                    <span className={styles.blog}>
                        <span className={styles.dot} aria-hidden="true">
                            ·
                        </span>
                        {BLOG.name}
                    </span>
                </a>

                <nav className={styles.links} aria-label="Ролики про этот сайт">
                    {PLATFORMS.filter((p) => links[p]).map((p) => (
                        <a
                            key={p}
                            className={styles.social}
                            href={links[p]}
                            target="_blank"
                            rel="noopener"
                            aria-label={videos[p] ? `Ролик про этот сайт в ${PLATFORM_LABELS[p]}` : `Без магИИ в ${PLATFORM_LABELS[p]}`}
                            data-audit={`topbar-${p}${videos[p] ? '-video' : '-profile'}`}
                        >
                            <SocialIcon platform={p} className={styles.socialIcon} />
                        </a>
                    ))}
                </nav>

                <ThemeToggle />
            </div>
        </div>
    );
}
