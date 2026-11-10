import { siInstagram, siTelegram, siTiktok, siVk, siYoutube } from 'simple-icons';
import type { Platform } from '../blog';

// Брендовые иконки площадок (simple-icons, CC0). У Rutube в simple-icons иконки нет — своя.
const RUTUBE = 'M7 5h6.5a4.5 4.5 0 0 1 1.3 8.8L18 19h-3.2l-2.9-5H9.8v5H7V5Zm2.8 2.6v3.8h3.6a1.9 1.9 0 0 0 0-3.8H9.8Z';

const PATHS: Record<Platform, string> = {
    youtube: siYoutube.path,
    instagram: siInstagram.path,
    tiktok: siTiktok.path,
    vk: siVk.path,
    rutube: RUTUBE,
    telegram: siTelegram.path,
};

export function SocialIcon({ platform, className }: { platform: Platform; className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
            <path d={PATHS[platform]} />
        </svg>
    );
}
