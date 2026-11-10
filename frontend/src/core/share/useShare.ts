import { useCallback } from 'react';
import { track } from '../audit/audit';
import { useToast } from '../toast/toast';
import { project, siteUrl } from '../project';

/**
 * «Поделиться»: на телефоне — системное меню (Web Share API), на ноутбуке и где share нет —
 * копирование ссылки с тостом.
 */
export function useShare() {
    const toast = useToast();

    return useCallback(
        async (options: { url?: string; title?: string; text?: string } = {}) => {
            const url = options.url ?? siteUrl + location.pathname;
            const title = options.title ?? project.title;
            const coarse = window.matchMedia('(pointer: coarse)').matches;

            if (navigator.share && coarse) {
                try {
                    await navigator.share({ url, title, text: options.text });
                    track('share', 'native', { url });
                } catch (error) {
                    if ((error as Error).name !== 'AbortError') track('share', 'native_failed', { message: (error as Error).message });
                }
                return;
            }

            try {
                await navigator.clipboard.writeText(url);
                toast.show('Ссылка скопирована');
                track('share', 'copy', { url });
            } catch {
                toast.show('Не удалось скопировать ссылку', 'error');
                track('share', 'copy_failed', { url });
            }
        },
        [toast],
    );
}
