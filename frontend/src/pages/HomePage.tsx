import { project } from '../core/project';
import { ShareButton } from '../core/share/ShareButton';
import { useToast } from '../core/toast/toast';
import styles from './HomePage.module.scss';

// Страница-заглушка заготовки: в форке заменяется содержимым проекта.
export function HomePage() {
    const toast = useToast();

    return (
        <article className={styles.page}>
            <h1 className={styles.title}>{project.title}</h1>
            <p className={styles.lead}>{project.description}</p>

            <div className={styles.demo}>
                <ShareButton />
                <button type="button" className={styles.secondary} onClick={() => toast.show('Всё работает')} data-audit="demo-toast">
                    Показать тост
                </button>
                <button type="button" className={styles.secondary} onClick={() => toast.show('Что-то пошло не так', 'error')} data-audit="demo-toast-error">
                    Тост с ошибкой
                </button>
            </div>
        </article>
    );
}
