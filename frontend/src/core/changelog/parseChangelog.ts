// Разбор CHANGELOG.md узкого формата: «## 1.2.0 — 2026-11-08» + список «- …».

export interface ChangelogEntry {
    version: string;
    date?: string;
    items: string[];
}

export function parseChangelog(md: string): ChangelogEntry[] {
    const entries: ChangelogEntry[] = [];
    for (const raw of md.split('\n')) {
        const line = raw.trim();
        const heading = /^##\s+v?(\S+)(?:\s+[—–-]\s+(.+))?$/.exec(line);
        if (heading) {
            entries.push({ version: heading[1] ?? '', date: heading[2], items: [] });
            continue;
        }
        const item = /^[-*]\s+(.+)$/.exec(line);
        if (item && entries.length > 0) entries[entries.length - 1]!.items.push(item[1] ?? '');
    }
    return entries;
}
