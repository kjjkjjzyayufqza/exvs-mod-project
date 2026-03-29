const STORAGE_KEY = "ssbhModelPreview.recentPaths";
const MAX_RECENT = 15;

export function readRecentModelPathsFromStorage(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function writeRecentModelPathsToStorage(paths: string[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(paths.slice(0, MAX_RECENT)));
}

export function buildNextRecentPaths(prev: string[], loadedPath: string): string[] {
  const t = loadedPath.trim();
  if (!t) return prev;
  return [t, ...prev.filter((p) => p !== t)].slice(0, MAX_RECENT);
}
