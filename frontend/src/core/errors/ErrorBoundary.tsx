import { Component, type ErrorInfo, type ReactNode } from 'react';
import { track } from '../audit/audit';
import { ErrorScreen } from './ErrorScreen';
import styles from './ErrorScreen.module.scss';

/** «Что-то сломалось»: ловит ошибки рендера, пишет их в аудит и не даёт сайту стать белым экраном. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
    state = { error: null as Error | null };

    static getDerivedStateFromError(error: Error) {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        track('react_error', error.message, {
            stack: error.stack?.slice(0, 1500),
            component: info.componentStack?.slice(0, 1000),
        });
    }

    render() {
        if (!this.state.error) return this.props.children;
        return (
            <ErrorScreen
                title="Что-то сломалось"
                text="Ошибка уже записана, починю. Попробуйте обновить страницу."
                action={
                    <button type="button" className={styles.retry} onClick={() => location.reload()}>
                        Обновить
                    </button>
                }
            />
        );
    }
}
