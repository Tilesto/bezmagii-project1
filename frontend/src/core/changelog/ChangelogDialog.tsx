import { useEffect, useRef } from 'react';
import { Icon } from '../icons/Icon';
import { changelog } from '../project';
import { parseChangelog } from './parseChangelog';
import styles from './ChangelogDialog.module.scss';

const entries = parseChangelog(changelog);

/** Публичный список изменений по клику на версию в подвале. */
export function ChangelogDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const ref = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        const dialog = ref.current;
        if (!dialog) return;
        if (open && !dialog.open) dialog.showModal();
        if (!open && dialog.open) dialog.close();
    }, [open]);

    return (
        <dialog
            ref={ref}
            className={styles.dialog}
            onClose={onClose}
            onClick={(e) => e.target === ref.current && onClose()}
            aria-labelledby="changelog-title"
        >
            <div className={styles.header}>
                <h2 id="changelog-title" className={styles.title}>
                    Что менялось
                </h2>
                <button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть">
                    <Icon name="close" />
                </button>
            </div>
            <div className={styles.body}>
                {entries.map((entry) => (
                    <section key={entry.version} className={styles.entry}>
                        <h3 className={styles.version}>
                            {entry.version}
                            {entry.date && <span className={styles.date}>{entry.date}</span>}
                        </h3>
                        <ul className={styles.items}>
                            {entry.items.map((item, i) => (
                                <li key={i}>{item}</li>
                            ))}
                        </ul>
                    </section>
                ))}
            </div>
        </dialog>
    );
}
