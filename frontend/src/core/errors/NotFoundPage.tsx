import { useEffect } from 'react';
import { track } from '../audit/audit';
import { ErrorScreen } from './ErrorScreen';

export function NotFoundPage() {
    useEffect(() => track('not_found', location.pathname), []);
    return <ErrorScreen code="404" title="Такой страницы нет" text="Возможно, ссылка устарела или в ней опечатка." action={<a href="/">На главную</a>} />;
}
