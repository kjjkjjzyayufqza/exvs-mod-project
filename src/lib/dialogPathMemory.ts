import { dirname } from "@tauri-apps/api/path";
import { open, save, type DialogFilter } from "@tauri-apps/plugin-dialog";
import { useConfigStore } from "@/store/configStore";

/**
 * Last folder of every open / save dialog, kept in the Tauri config store
 * (`settings.json`) as `dialogDefaultPath: { [key]: folder }`. `FilePathInput`
 * and the dialogs of the PS4 workspaces share it, so each path input reopens
 * where it was last used.
 */
export const DIALOG_DEFAULT_PATH_STORE_KEY = "dialogDefaultPath";

export type PathPickerKind = "file" | "folder" | "save";
type DialogDefaultPathMap = Record<string, string | undefined>;

function config() {
  return useConfigStore.getState();
}

/**
 * Folder a dialog should open at: the remembered folder of `mapKey`, else the
 * folder of the value stored under `valueKey`.
 */
export async function rememberedDialogPath(
  mapKey: string | undefined,
  valueKey: string | undefined,
  kind: PathPickerKind,
): Promise<string | undefined> {
  const { getSetting } = config();
  if (mapKey) {
    const map = (await getSetting<DialogDefaultPathMap>(DIALOG_DEFAULT_PATH_STORE_KEY)) ?? {};
    const remembered = map[mapKey];
    if (typeof remembered === "string" && remembered) return remembered;
  }
  if (valueKey) {
    const value = await getSetting<unknown>(valueKey);
    if (typeof value === "string" && value) {
      if (kind === "folder") return value;
      if (kind === "file") return await dirname(value);
    }
  }
  return undefined;
}

/** Remember the folder of a picked path under `mapKey`. */
export async function rememberDialogPath(mapKey: string, picked: string | string[], kind: PathPickerKind): Promise<void> {
  const first = Array.isArray(picked) ? picked[0] : picked;
  if (!first) return;
  const folder = kind === "folder" ? first : await dirname(first);
  const { getSetting, setSetting } = config();
  const map = (await getSetting<DialogDefaultPathMap>(DIALOG_DEFAULT_PATH_STORE_KEY)) ?? {};
  await setSetting(DIALOG_DEFAULT_PATH_STORE_KEY, { ...map, [mapKey]: folder });
}

function withFileName(folder: string | undefined, fileName: string | undefined): string | undefined {
  const name = fileName?.trim();
  if (!name) return folder;
  if (!folder) return name;
  const separator = folder.includes("\\") ? "\\" : "/";
  return `${folder.replace(/[/\\]+$/, "")}${separator}${name}`;
}

export interface PickPathOptions {
  /** Memory key of this input; one per input. */
  key: string;
  kind: PathPickerKind;
  title?: string;
  filters?: DialogFilter[];
  /** Suggested file name of a save dialog, joined to the remembered folder. */
  defaultFileName?: string;
}

/** Open a single-path dialog at the input's remembered folder and remember the pick. */
export async function pickPath({ key, kind, title, filters, defaultFileName }: PickPathOptions): Promise<string | null> {
  const folder = await rememberedDialogPath(key, undefined, kind);
  const picked =
    kind === "save"
      ? await save({ title, filters, defaultPath: withFileName(folder, defaultFileName) })
      : await open({ multiple: false, directory: kind === "folder", title, filters, defaultPath: folder });
  if (typeof picked !== "string" || !picked.trim()) return null;
  await rememberDialogPath(key, picked, kind);
  return picked;
}
