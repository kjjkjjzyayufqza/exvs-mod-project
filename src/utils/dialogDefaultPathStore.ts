import { useConfigStore } from "@/store/configStore";

export const DIALOG_DEFAULT_PATH_STORE_KEY = "dialogDefaultPath";

export type DialogDefaultPathMap = Record<string, string | undefined>;

function stripTrailingSeparators(path: string): string {
  return path.replace(/[/\\]+$/, "");
}

function parentDirectory(filePath: string): string {
  const trimmed = stripTrailingSeparators(filePath);
  const index = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (index <= 0) return trimmed;
  return trimmed.slice(0, index);
}

export async function getStoredDialogDefaultPath(key: string): Promise<string | undefined> {
  const map =
    (await useConfigStore.getState().getSetting<DialogDefaultPathMap>(DIALOG_DEFAULT_PATH_STORE_KEY)) ?? {};
  const value = map[key]?.trim();
  return value || undefined;
}

/** Remember the exact file path (not only its parent directory). */
export async function rememberStoredDialogFilePath(
  key: string,
  filePath: string,
): Promise<void> {
  const trimmed = filePath.trim();
  if (!trimmed) return;

  const { getSetting, setSetting } = useConfigStore.getState();
  const map =
    (await getSetting<DialogDefaultPathMap>(DIALOG_DEFAULT_PATH_STORE_KEY)) ?? {};
  await setSetting(DIALOG_DEFAULT_PATH_STORE_KEY, { ...map, [key]: trimmed });
}

export async function rememberStoredDialogSelection(
  key: string,
  selectedPath: string,
  kind: "file" | "directory",
): Promise<void> {
  const trimmed = selectedPath.trim();
  if (!trimmed) return;

  const directory =
    kind === "directory" ? stripTrailingSeparators(trimmed) : parentDirectory(trimmed);
  if (!directory) return;

  const { getSetting, setSetting } = useConfigStore.getState();
  const map =
    (await getSetting<DialogDefaultPathMap>(DIALOG_DEFAULT_PATH_STORE_KEY)) ?? {};
  await setSetting(DIALOG_DEFAULT_PATH_STORE_KEY, { ...map, [key]: directory });
}
