/**
 * Plugin `consoleMenu` shape as returned by `/extensions/:identifier/plugin-layout`
 * (same structure as `export const consoleMenu` in each extension's `router.options.ts`).
 */
export type PluginConsoleMenuItem = {
    name?: string;
    path?: string;
    sort?: number;
    children?: PluginConsoleMenuItem[];
};

/**
 * Normalizes a menu `path` to a single URL segment or nested `a/b` path (no leading slash).
 *
 * @param path - Raw path from router.options (may start with "/")
 */
export function normalizePluginConsolePath(path: string): string {
    return path.trim().replace(/^\/+/u, "").replace(/\/+$/u, "");
}

/**
 * Walks `consoleMenu` in `sort` order and returns the first navigable path under
 * `/extension/{identifier}/console/…`, matching how the plugin sidebar orders items.
 *
 * @param consoleMenu - `consoleMenu` from plugin-layout API (or null/undefined)
 * @returns Path after `console/` without leading slash, or `null` if none
 *
 * @example
 * // picmaster: first item path "record" → "record"
 * resolveExtensionConsoleEntryPath([{ path: "record", sort: 1 }, { path: "config", sort: 2 }])
 */
export function resolveExtensionConsoleEntryPath(consoleMenu: unknown): string | null {
    if (!Array.isArray(consoleMenu) || consoleMenu.length === 0) {
        return null;
    }

    const walk = (items: PluginConsoleMenuItem[]): string | null => {
        const sorted = [...items].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
        for (const item of sorted) {
            if (item.children?.length) {
                const nested = walk(item.children);
                if (nested) {
                    const parentSeg = normalizePluginConsolePath(item.path ?? "");
                    return parentSeg ? `${parentSeg}/${nested}` : nested;
                }
            }
            const seg = normalizePluginConsolePath(item.path ?? "");
            if (seg.length > 0) {
                return seg;
            }
        }
        return null;
    };

    return walk(consoleMenu as PluginConsoleMenuItem[]);
}

/**
 * Builds the full URL to open a plugin's console at the first menu route.
 *
 * @param baseUrl - Site origin (e.g. `window.location.origin` or dev base URL)
 * @param identifier - Extension package identifier
 * @param consoleMenu - Optional menu from plugin-layout; falls back to `/console` only
 */
export function buildExtensionConsoleManageUrl(
    baseUrl: string,
    identifier: string,
    consoleMenu: unknown,
): string {
    const root = `${baseUrl.replace(/\/+$/u, "")}/extension/${identifier}/console`;
    const entry = resolveExtensionConsoleEntryPath(consoleMenu);
    if (!entry) {
        return root;
    }
    return `${root}/${entry}`.replace(/([^:]\/)\/+/gu, "$1");
}
