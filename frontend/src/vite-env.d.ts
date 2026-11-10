/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** Адрес реестра проектов; по умолчанию https://bezmagii.site/projects.json */
    readonly VITE_REGISTRY_URL?: string;
}
