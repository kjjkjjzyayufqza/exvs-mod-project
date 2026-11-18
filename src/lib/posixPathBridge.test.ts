import { describe, expect, it, vi } from "vitest";
import { installPosixPathBridge, rewriteIpcPayload, toPosixHostPath } from "./posixPathBridge";

describe("toPosixHostPath", () => {
  it("rewrites backslash-rooted and mixed POSIX paths", () => {
    expect(toPosixHostPath("\\data\\mod\\0x036B9E67.fhm2d")).toBe("/data/mod/0x036B9E67.fhm2d");
    expect(toPosixHostPath("/data/dplcache_release\\0x036B9E67.fhm2d")).toBe("/data/dplcache_release/0x036B9E67.fhm2d");
  });

  it("leaves Windows, UNC, relative, and plain strings alone", () => {
    expect(toPosixHostPath("E:\\XB\\mod")).toBe("E:\\XB\\mod");
    expect(toPosixHostPath("\\\\server\\share\\a")).toBe("\\\\server\\share\\a");
    expect(toPosixHostPath(".\\pack\\models\\a.numdlb")).toBe(".\\pack\\models\\a.numdlb");
    expect(toPosixHostPath("/data/mod")).toBe("/data/mod");
    expect(toPosixHostPath("\\first line\nsecond")).toBe("\\first line\nsecond");
  });
});

describe("rewriteIpcPayload", () => {
  it("rewrites nested strings and keeps other values", () => {
    expect(
      rewriteIpcPayload({ structurePath: "\\w\\a_structure.json", items: ["\\w\\b", 3], keep: true }),
    ).toEqual({ structurePath: "/w/a_structure.json", items: ["/w/b", 3], keep: true });
  });
});

describe("installPosixPathBridge", () => {
  it("does nothing on a Windows host", () => {
    const fetch = vi.fn();
    const host = { fetch } as unknown as { fetch: typeof globalThis.fetch };
    expect(installPosixPathBridge(host, "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(false);
    expect(host.fetch).toBe(fetch);
  });

  it("rewrites JSON bodies and the plugin-fs path header for IPC requests only", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const host = {
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init });
        return new Response("null");
      }) as typeof globalThis.fetch,
    };
    expect(installPosixPathBridge(host, "Mozilla/5.0 (X11; Linux x86_64)")).toBe(true);

    await host.fetch("ipc://localhost/repack_fhm2d", {
      method: "POST",
      body: JSON.stringify({ structurePath: "\\w\\a_structure.json" }),
      headers: { "Content-Type": "application/json" },
    });
    await host.fetch("ipc://localhost/plugin%3Afs%7Cwrite_file", {
      method: "POST",
      body: new Uint8Array([1]),
      headers: { path: encodeURIComponent("\\w\\out.bin") },
    });
    await host.fetch("asset://localhost/%5Cw%5Cimage.png");

    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ structurePath: "/w/a_structure.json" });
    expect(new Headers(calls[1].init?.headers).get("path")).toBe(encodeURIComponent("/w/out.bin"));
    expect(calls[2].init).toBeUndefined();
  });
});
