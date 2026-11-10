import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const root = fileURLToPath(new URL('..', import.meta.url));
const project = JSON.parse(readFileSync(`${root}project.json`, 'utf8')) as {
    slug: string;
    number: number;
    title: string;
    description: string;
    url?: string;
    routes?: string[];
};
const siteUrl = (project.url ?? `https://${project.slug}.bezmagii.site`).replace(/\/$/, '');
const fullTitle = project.number > 0 ? `${project.title} — Сайт через день #${project.number}` : project.title;

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Мета, OG, robots.txt, sitemap.xml и manifest — из project.json, одинаково во всех проектах. */
function projectMeta(): Plugin {
    return {
        name: 'bezmagii-project-meta',
        transformIndexHtml(html) {
            return html
                .replaceAll('%TITLE%', escapeHtml(fullTitle))
                .replaceAll('%DESCRIPTION%', escapeHtml(project.description))
                .replaceAll('%URL%', `${siteUrl}/`)
                .replaceAll('%OG_IMAGE%', `${siteUrl}/og.png`);
        },
        generateBundle() {
            const routes = project.routes?.length ? project.routes : ['/'];
            const today = new Date().toISOString().slice(0, 10);
            this.emitFile({
                type: 'asset',
                fileName: 'robots.txt',
                source: `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${siteUrl}/sitemap.xml\n`,
            });
            this.emitFile({
                type: 'asset',
                fileName: 'sitemap.xml',
                source:
                    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
                    routes.map((r) => `  <url><loc>${siteUrl}${r}</loc><lastmod>${today}</lastmod></url>`).join('\n') +
                    `\n</urlset>\n`,
            });
            this.emitFile({
                type: 'asset',
                fileName: 'manifest.webmanifest',
                source: JSON.stringify(
                    {
                        name: fullTitle,
                        short_name: project.title.slice(0, 12),
                        start_url: '/',
                        display: 'standalone',
                        background_color: '#161614',
                        theme_color: '#161614',
                        icons: [
                            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
                            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
                        ],
                    },
                    null,
                    2,
                ),
            });
        },
    };
}

export default defineConfig({
    plugins: [react(), projectMeta()],
    css: {
        modules: { localsConvention: 'camelCase' },
        preprocessorOptions: {
            scss: { loadPaths: [fileURLToPath(new URL('./src/styles', import.meta.url))] },
        },
    },
    server: {
        port: 5173,
        proxy: { '/api': 'http://127.0.0.1:3000' },
    },
    build: { target: 'es2022', sourcemap: true },
});
