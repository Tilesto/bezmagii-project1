import { useEffect, useState, type MouseEvent } from 'react';
import { track } from '../audit/audit';
import { Icon } from '../icons/Icon';
import { currentTheme, followSystemTheme, setTheme, type Theme } from './theme';
import styles from './ThemeToggle.module.scss';

export function ThemeToggle() {
    const [theme, setThemeState] = useState<Theme>(() => currentTheme());

    useEffect(() => followSystemTheme(setThemeState), []);

    const toggle = (event: MouseEvent<HTMLButtonElement>) => {
        const next: Theme = theme === 'dark' ? 'light' : 'dark';
        const rect = event.currentTarget.getBoundingClientRect();
        setTheme(next, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
        setThemeState(next);
        track('theme_change', next);
    };

    const label = theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему';

    return (
        <button type="button" className={styles.toggle} onClick={toggle} aria-label={label} title={label} data-audit="theme-toggle">
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} className={styles.icon} />
        </button>
    );
}
