function normalizedPath(path: string): string {
  return path.trim().replace(/\\/g, "/").toLowerCase();
}

export function registerMotionNuanmbPath(paths: readonly string[], path: string): string[] {
  const trimmed = path.trim();
  if (!trimmed || paths.some((existingPath) => normalizedPath(existingPath) === normalizedPath(trimmed))) {
    return [...paths];
  }
  return [...paths, trimmed];
}
