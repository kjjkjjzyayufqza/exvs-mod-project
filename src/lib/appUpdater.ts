import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Store } from "@tauri-apps/plugin-store";

export const GITHUB_UPDATE_TOKEN_STORE_KEY = "githubUpdateToken";

export const UPDATER_LATEST_JSON_URL =
  "https://github.com/kjjkjjzyayufqza/exvs-mod-project/releases/latest/download/latest.json";

export const GITHUB_RELEASES_LATEST_API =
  "https://api.github.com/repos/kjjkjjzyayufqza/exvs-mod-project/releases/latest";

export type GithubLatestRelease = {
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
};

export type AppUpdatePrompt = {
  update: Update;
  currentVersion: string;
  latestVersion: string;
  changelog: string;
};

export type DownloadProgressState = {
  received: number;
  total: number;
};

export function buildUpdaterHeaders(
  token: string | null | undefined,
): Record<string, string> | undefined {
  const trimmed = token?.trim();
  if (!trimmed) {
    return undefined;
  }
  return {
    Authorization: `Bearer ${trimmed}`,
    Accept: "application/octet-stream",
  };
}

export function resolveUpdaterToken(
  stored: string | null | undefined,
  envToken: string | null | undefined,
): string | null {
  const storedTrimmed = stored?.trim();
  if (storedTrimmed) {
    return storedTrimmed;
  }
  const envTrimmed = envToken?.trim();
  if (envTrimmed) {
    return envTrimmed;
  }
  return null;
}

export async function loadGithubUpdateToken(): Promise<string | null> {
  const store = await Store.load("settings.json");
  const stored = await store.get<string>(GITHUB_UPDATE_TOKEN_STORE_KEY);
  const envToken = await invoke<string | null>("read_updater_github_token");
  return resolveUpdaterToken(stored, envToken);
}

export async function saveGithubUpdateToken(token: string): Promise<void> {
  const store = await Store.load("settings.json");
  const trimmed = token.trim();
  if (trimmed) {
    await store.set(GITHUB_UPDATE_TOKEN_STORE_KEY, trimmed);
  } else {
    await store.delete(GITHUB_UPDATE_TOKEN_STORE_KEY);
  }
  await store.save();
}

export async function checkForAppUpdate(): Promise<Update | null> {
  const token = await loadGithubUpdateToken();
  const headers = buildUpdaterHeaders(token);
  return check({
    headers,
    timeout: 30_000,
  });
}

export async function fetchLatestGithubRelease(): Promise<GithubLatestRelease | null> {
  try {
    return await invoke<GithubLatestRelease>("fetch_github_latest_release");
  } catch {
    return null;
  }
}

export function pickChangelog(...candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return "";
}

export function stripVersionPrefix(version: string): string {
  return version.trim().replace(/^v/i, "");
}

export function compareSemver(left: string, right: string): number {
  const leftParts = stripVersionPrefix(left).split(/[.-]/);
  const rightParts = stripVersionPrefix(right).split(/[.-]/);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = Number.parseInt(leftParts[index] ?? "0", 10);
    const rightValue = Number.parseInt(rightParts[index] ?? "0", 10);
    const leftNumber = Number.isFinite(leftValue) ? leftValue : 0;
    const rightNumber = Number.isFinite(rightValue) ? rightValue : 0;
    if (leftNumber !== rightNumber) {
      return leftNumber - rightNumber;
    }
  }
  return 0;
}

export async function loadAppUpdatePrompt(): Promise<AppUpdatePrompt | null> {
  const [update, release] = await Promise.all([
    checkForAppUpdate().catch(() => null),
    fetchLatestGithubRelease(),
  ]);
  if (!update) {
    return null;
  }
  return {
    update,
    currentVersion: update.currentVersion,
    latestVersion: update.version,
    changelog: pickChangelog(release?.body, update.body),
  };
}

export function accumulateDownloadProgress(
  state: DownloadProgressState,
  event: DownloadEvent,
): DownloadProgressState & { percent: number | null } {
  let received = state.received;
  let total = state.total;
  if (event.event === "Started") {
    total = event.data.contentLength ?? 0;
    received = 0;
  } else if (event.event === "Progress") {
    received += event.data.chunkLength;
  }
  return {
    received,
    total,
    percent: total > 0 ? Math.min(100, Math.round((received / total) * 100)) : null,
  };
}

export async function installAppUpdate(
  update: Update,
  onEvent?: (event: DownloadEvent) => void,
): Promise<void> {
  await update.downloadAndInstall(onEvent);
  if (!navigator.userAgent.includes("Windows")) {
    await relaunch();
  }
}

export async function readAppVersion(): Promise<string> {
  return getVersion();
}
