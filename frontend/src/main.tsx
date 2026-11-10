import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startAudit } from './core/audit/audit';
import '@fontsource-variable/rubik';
import '@fontsource-variable/jetbrains-mono';
import './styles/styles.scss';

startAudit();

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
