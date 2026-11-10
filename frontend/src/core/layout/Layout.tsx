import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';
import { trackPageView } from '../audit/audit';
import { CookieBanner } from '../cookie/CookieBanner';
import { ErrorBoundary } from '../errors/ErrorBoundary';
import { Footer } from '../footer/Footer';
import { TopBar } from '../topbar/TopBar';
import styles from './Layout.module.scss';

/** Каркас каждого сайта: полоса челленджа, контент проекта, подвал, cookie-баннер. */
export function Layout() {
    const { pathname, search } = useLocation();

    useEffect(() => {
        trackPageView();
    }, [pathname, search]);

    return (
        <div className={styles.layout}>
            <TopBar />
            <main className={styles.main}>
                <ErrorBoundary key={pathname}>
                    <Outlet />
                </ErrorBoundary>
            </main>
            <Footer />
            <CookieBanner />
        </div>
    );
}
