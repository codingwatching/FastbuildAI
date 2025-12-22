export function omit<T extends object, K extends keyof T>(obj: T, keys: K | K[]): Omit<T, K> {
    const keysToOmit = new Set(Array.isArray(keys) ? keys : [keys]);
    return Object.fromEntries(
        Object.entries(obj).filter(([key]) => !keysToOmit.has(key as K)),
    ) as Omit<T, K>;
}
