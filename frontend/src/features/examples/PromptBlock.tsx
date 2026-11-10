import { useToast } from '../../core/toast/toast';
import styles from './PromptBlock.module.scss';

/** Промпт, с которого нейросеть сделала игру, дословно. Второй и дальше — доработки. */
export function PromptBlock({ prompts }: { prompts: string[] }) {
    const toast = useToast();

    const copy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast.show('Промпт скопирован', 'success');
        } catch {
            toast.show('Не получилось скопировать, выделите вручную', 'error');
        }
    };

    return (
        <section className={styles.block}>
            <h2 className={styles.h2}>{prompts.length > 1 ? 'Промпты' : 'Промпт'}</h2>
            <p className={styles.muted}>Нейросеть сделала игру по этому тексту. Код руками не правили.</p>
            {prompts.map((text, i) => (
                <div key={i} className={styles.prompt}>
                    <div className={styles.bar}>
                        <span>{i === 0 ? 'Первый промпт' : `Доработка ${i}`}</span>
                        <button type="button" className={styles.copy} onClick={() => copy(text)} data-audit="copy-prompt">
                            Скопировать
                        </button>
                    </div>
                    <pre className={styles.text}>{text}</pre>
                </div>
            ))}
        </section>
    );
}
