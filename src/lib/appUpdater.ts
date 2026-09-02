import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Store } from "@tauri-apps/plugin-store";

export const GITHUB_UPDATE_TOKEN_STORE_KEY = "githubUpdateToken";

export const UPDATER_LATEST_JSON_URL =
  "https://github.com/kjjkjjzyayufqza/exvs-mod-project/releases/latest/download/latest.json";

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
