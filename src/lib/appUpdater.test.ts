import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  accumulateDownloadProgress,
  buildUpdaterHeaders,
  compareSemver,
  loadAppUpdatePrompt,
  pickChangelog,
  resolveUpdaterToken,
  stripVersionPrefix,
} from "./appUpdater";

const invokeMock = vi.fn();
const checkMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));
vi.mock("@tauri-apps/plugin-updater", () => ({
  check: (...args: unknown[]) => checkMock(...args),
}));
vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-store", () => ({
  Store: {
    load: vi.fn(async () => ({
      get: async () => null,
      set: vi.fn(),
      delete: vi.fn(),
      save: vi.fn(),
    })),
  },
}));

describe("appUpdater token helpers", () => {
  it("omits updater headers when no GitHub token is set", () => {
    expect(buildUpdaterHeaders(null)).toBeUndefined();
    expect(buildUpdaterHeaders("   ")).toBeUndefined();
  });

  it("sends a bearer token so private GitHub releases can be read", () => {
    expect(buildUpdaterHeaders(" ghp_example ")).toEqual({
      Authorization: "Bearer ghp_example",
      Accept: "application/octet-stream",
    });
  });

  it("prefers a stored token over the process environment token", () => {
    expect(resolveUpdaterToken(" stored ", " env ")).toBe("stored");
    expect(resolveUpdaterToken("  ", " env ")).toBe("env");
    expect(resolveUpdaterToken(null, null)).toBeNull();
  });
});

describe("appUpdater prompt helpers", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    checkMock.mockReset();
    invokeMock.mockResolvedValue("env-token");
  });

  it("prefers GitHub release notes over updater latest.json notes", () => {
    expect(pickChangelog("  GitHub body  ", "updater body")).toBe("GitHub body");
    expect(pickChangelog("   ", "updater body")).toBe("updater body");
    expect(pickChangelog(null, undefined)).toBe("");
  });

  it("compares dotted versions numerically", () => {
    expect(stripVersionPrefix("v0.1.12")).toBe("0.1.12");
    expect(compareSemver("0.1.10", "0.1.9")).toBeGreaterThan(0);
    expect(compareSemver("v0.1.0", "0.1.0")).toBe(0);
  });

  it("tracks NSIS download percent from updater events", () => {
    const started = accumulateDownloadProgress({ received: 0, total: 0 }, {
      event: "Started",
      data: { contentLength: 200 },
    });
    expect(started.percent).toBe(0);
    const next = accumulateDownloadProgress(started, {
      event: "Progress",
      data: { chunkLength: 50 },
    });
    expect(next.percent).toBe(25);
  });

  it("loads version plus changelog when GitHub has a newer installable release", async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "read_updater_github_token") {
        return "env-token";
      }
      if (command === "fetch_github_latest_release") {
        return {
          tag_name: "v0.1.12",
          name: "EXVS Mod Project v0.1.12",
          body: "Fixed NSIS extra bins",
          html_url: "https://github.com/kjjkjjzyayufqza/exvs-mod-project/releases/tag/v0.1.12",
        };
      }
      throw new Error(`unexpected invoke ${command}`);
    });
    checkMock.mockResolvedValue({
      currentVersion: "0.1.8",
      version: "0.1.12",
      body: "latest.json notes",
    });

    const prompt = await loadAppUpdatePrompt();
    expect(prompt).toMatchObject({
      currentVersion: "0.1.8",
      latestVersion: "0.1.12",
      changelog: "Fixed NSIS extra bins",
    });
    expect(checkMock).toHaveBeenCalled();
    expect(invokeMock).toHaveBeenCalledWith("fetch_github_latest_release");
  });

  it("falls back to updater notes when the GitHub API is unavailable", async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "read_updater_github_token") {
        return "env-token";
      }
      if (command === "fetch_github_latest_release") {
        throw new Error("GitHub latest release request failed");
      }
      throw new Error(`unexpected invoke ${command}`);
    });
    checkMock.mockResolvedValue({
      currentVersion: "0.1.8",
      version: "0.1.12",
      body: "latest.json notes",
    });

    const prompt = await loadAppUpdatePrompt();
    expect(prompt).toMatchObject({
      changelog: "latest.json notes",
      latestVersion: "0.1.12",
    });
  });

  it("does not prompt when the updater reports no newer package", async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "read_updater_github_token") {
        return "env-token";
      }
      if (command === "fetch_github_latest_release") {
        return {
          tag_name: "v0.1.8",
          name: null,
          body: "already installed",
          html_url: "https://example.invalid",
        };
      }
      throw new Error(`unexpected invoke ${command}`);
    });
    checkMock.mockResolvedValue(null);

    await expect(loadAppUpdatePrompt()).resolves.toBeNull();
  });
});
