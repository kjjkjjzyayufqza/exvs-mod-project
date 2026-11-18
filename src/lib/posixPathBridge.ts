/**
 * Path bridge for POSIX hosts (Linux, macOS).
 *
 * Frontend path helpers normalize to Windows separators (`toWindowsPath`, `${dir}\\${name}`), which is
 * right for the shipped Windows build. On a POSIX host the same code turns `/data/mod` into `\data\mod`,
 * which the OS reads as one file name in the working directory. This bridge rewrites those paths back to
 * POSIX form where they leave the webview: JSON command arguments, and the `path` header that plugin-fs
 * write calls carry. Windows hosts never install it, and drive-letter or UNC paths are left untouched.
 */

const MAX_PATH_LENGTH = 4096;

/** Rewrites a backslash-separated POSIX path (`\data\mod`, `/data/mod\a.bin`) to forward slashes. */
export function toPosixHostPath(value: string): string {
  if (value.length > MAX_PATH_LENGTH || value.includes("\n")) return value;
  if (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\")) return value;
  if (value.startsWith("\\") || (value.startsWith("/") && value.includes("\\"))) {
    return value.replace(/\\/g, "/");
  }
  return value;
}

/** Applies `toPosixHostPath` to every string inside a JSON-shaped IPC payload. */
export function rewriteIpcPayload(value: unknown): unknown {
  if (typeof value === "string") return toPosixHostPath(value);
  if (Array.isArray(value)) return value.map(rewriteIpcPayload);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, rewriteIpcPayload(item)]),
    );
  }
  return value;
}

export function isPosixHost(userAgent: string): boolean {
  return !/Windows/i.test(userAgent);
}

function isTauriIpcUrl(url: string): boolean {
  return url.startsWith("ipc:") || url.startsWith("http://ipc.localhost") || url.startsWith("https://ipc.localhost");
}

function rewriteIpcInit(init: RequestInit | undefined): RequestInit | undefined {
  if (!init) return init;
  const headers = new Headers(init.headers);
  const encodedPath = headers.get("path");
  if (encodedPath) {
    headers.set("path", encodeURIComponent(toPosixHostPath(decodeURIComponent(encodedPath))));
  }
  let body = init.body;
  if (typeof body === "string" && (headers.get("Content-Type") ?? "").includes("json")) {
    try {
      body = JSON.stringify(rewriteIpcPayload(JSON.parse(body)));
    } catch {
      // Not JSON after all; send it unchanged.
    }
  }
  return { ...init, headers, body };
}

type FetchHost = { fetch: typeof fetch };

/** Wraps `host.fetch` so Tauri IPC requests carry POSIX paths. Returns false when nothing was installed. */
export function installPosixPathBridge(host: FetchHost, userAgent: string): boolean {
  if (!isPosixHost(userAgent)) return false;
  const realFetch = host.fetch.bind(host);
  host.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!isTauriIpcUrl(url)) return realFetch(input, init);
    return realFetch(input, rewriteIpcInit(init));
  };
  return true;
}
