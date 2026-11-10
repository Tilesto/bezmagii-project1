import clsx from 'clsx';
import { useToast } from '../../core/toast/toast';
import styles from './CopyField.module.scss';

/** Строка кода с кнопкой «Скопировать». secret — размывает, пока не наведёшь (на случай записи экрана). */
export function CopyField({ value, label, audit, secret }: { value: string; label?: string; audit: string; secret?: boolean }) {
    const toast = useToast();

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            toast.show('Скопировано', 'success');
        } catch {
            toast.show('Не получилось скопировать, выделите вручную', 'error');
        }
    };

    return (
        <div className={styles.field}>
            {label && <div className={styles.label}>{label}</div>}
            <div className={styles.row}>
                <code className={clsx(styles.code, secret && styles.secret)} tabIndex={0}>
                    {value}
                </code>
                <button type="button" className={styles.copy} onClick={copy} data-audit={audit}>
                    Скопировать
                </button>
            </div>
        </div>
    );
}
