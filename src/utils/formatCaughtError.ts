/**
 * Format a thrown value from `invoke` / Tauri so operators see the real payload.
 * `Result<T, String>` rejects as a primitive string (`error.message` is empty).
 */
export function formatCaughtError(error: unknown, fallback = "Unknown error"): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    return message || String(error);
  }
  if (typeof error === "string") {
    const trimmed = error.trim();
    return trimmed || fallback;
  }
  try {
    const json = JSON.stringify(error);
    if (typeof json === "string" && json !== "" && json !== "{}") {
      return json;
    }
  } catch {
    // fall through
  }
  const text = String(error);
  if (text && text !== "[object Object]") {
    return text;
  }
  return fallback;
}
