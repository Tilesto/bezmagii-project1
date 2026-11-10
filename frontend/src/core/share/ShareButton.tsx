import clsx from 'clsx';
import { Icon } from '../icons/Icon';
import { useShare } from './useShare';
import styles from './ShareButton.module.scss';

export function ShareButton({ className, label = 'Поделиться' }: { className?: string; label?: string }) {
    const share = useShare();
    return (
        <button type="button" className={clsx(styles.button, className)} onClick={() => void share()} data-audit="share">
            <Icon name="share" className={styles.icon} />
            {label}
        </button>
    );
}
