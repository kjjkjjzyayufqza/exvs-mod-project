import { useConfigStore } from "@/store/configStore";
import { normalizePathForStar } from "../../utils/fileTreeStars";
import type { EffectInventoryCategory } from "./effectFolderEditorUtils";

export const EFFECT_FOLDER_EDITOR_STORE_KEY = "testEditor.effectFolder.v1";

export type EffectFolderPackSelectionState = {
  focusedKey: string | null;
  selectedKeys: string[];
  category: EffectInventoryCategory | "all";
  searchQuery: string;
};

export type EffectFolderWorkspaceState = {
  folderPath: string;
  packSelections?: Record<string, EffectFolderPackSelectionState>;
};

export type EffectFolderEditorStoreDocument = Record<string, EffectFolderWorkspaceState>;

export const DEFAULT_EFFECT_FOLDER_PACK_SELECTION: EffectFolderPackSelectionState = {
  focusedKey: null,
  selectedKeys: [],
  category: "all",
  searchQuery: "",
};

function workspaceStoreKey(workspaceRoot: string): string {
  return normalizePathForStar(workspaceRoot.trim());
}

function isCategory(value: unknown): value is EffectInventoryCategory | "all" {
  return value === "all" || value === "efxbn" || value === "models" || value === "textures" || value === "other";
}

function parsePackSelection(raw: unknown): EffectFolderPackSelectionState | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const category = isCategory(record.category) ? record.category : "all";
  const focusedKey = record.focusedKey == null ? null : String(record.focusedKey);
  const searchQuery = typeof record.searchQuery === "string" ? record.searchQuery : "";
  const selectedKeys = Array.isArray(record.selectedKeys)
    ? record.selectedKeys.filter((key): key is string => typeof key === "string")
    : [];
  return { focusedKey, selectedKeys, category, searchQuery };
}

function parseWorkspaceState(raw: unknown): EffectFolderWorkspaceState | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const folderPath = typeof record.folderPath === "string" ? record.folderPath.trim() : "";
  if (!folderPath) return null;

  const packSelections: Record<string, EffectFolderPackSelectionState> = {};
  if (record.packSelections && typeof record.packSelections === "object") {
    for (const [packKey, value] of Object.entries(record.packSelections as Record<string, unknown>)) {
      const parsed = parsePackSelection(value);
      if (parsed) packSelections[packKey] = parsed;
    }
  }

  return {
    folderPath,
    packSelections: Object.keys(packSelections).length > 0 ? packSelections : undefined,
  };
}

async function readStoreDocument(): Promise<EffectFolderEditorStoreDocument> {
  const raw = await useConfigStore.getState().getSetting<EffectFolderEditorStoreDocument>(
    EFFECT_FOLDER_EDITOR_STORE_KEY,
  );
  if (!raw || typeof raw !== "object") return {};
  return raw;
}

async function writeStoreDocument(document: EffectFolderEditorStoreDocument): Promise<void> {
  await useConfigStore.getState().setSetting(EFFECT_FOLDER_EDITOR_STORE_KEY, document);
}

export async function getEffectFolderWorkspaceState(
  workspaceRoot: string,
): Promise<EffectFolderWorkspaceState | undefined> {
  const key = workspaceStoreKey(workspaceRoot);
  if (!key) return undefined;
  const document = await readStoreDocument();
  const parsed = parseWorkspaceState(document[key]);
  return parsed ?? undefined;
}

export async function rememberEffectFolderPath(
  workspaceRoot: string,
  folderPath: string,
): Promise<void> {
  const trimmedRoot = workspaceRoot.trim();
  const trimmedFolder = folderPath.trim();
  if (!trimmedRoot || !trimmedFolder) return;

  const key = workspaceStoreKey(trimmedRoot);
  const document = await readStoreDocument();
  const existing = parseWorkspaceState(document[key]);
  document[key] = {
    folderPath: trimmedFolder,
    packSelections: existing?.packSelections,
  };
  await writeStoreDocument(document);
}

export async function getEffectFolderPackSelection(
  workspaceRoot: string,
  packKey: string,
): Promise<EffectFolderPackSelectionState | undefined> {
  const workspace = await getEffectFolderWorkspaceState(workspaceRoot);
  if (!workspace?.packSelections) return undefined;
  return workspace.packSelections[packKey] ?? undefined;
}

export async function rememberEffectFolderPackSelection(
  workspaceRoot: string,
  packKey: string,
  selection: EffectFolderPackSelectionState,
): Promise<void> {
  const trimmedRoot = workspaceRoot.trim();
  const trimmedPackKey = packKey.trim();
  if (!trimmedRoot || !trimmedPackKey) return;

  const key = workspaceStoreKey(trimmedRoot);
  const document = await readStoreDocument();
  const existing = parseWorkspaceState(document[key]);
  const folderPath = existing?.folderPath ?? "";
  if (!folderPath) return;

  document[key] = {
    folderPath,
    packSelections: {
      ...(existing?.packSelections ?? {}),
      [trimmedPackKey]: {
        focusedKey: selection.focusedKey,
        selectedKeys: [...selection.selectedKeys],
        category: selection.category,
        searchQuery: selection.searchQuery,
      },
    },
  };
  await writeStoreDocument(document);
}

export function sanitizeEffectFolderPackSelection(
  selection: EffectFolderPackSelectionState,
  validKeys: Set<string>,
): EffectFolderPackSelectionState {
  const selectedKeys = selection.selectedKeys.filter((key) => validKeys.has(key));
  const focusedKey = selection.focusedKey && validKeys.has(selection.focusedKey) ? selection.focusedKey : null;
  return {
    category: selection.category,
    searchQuery: selection.searchQuery,
    selectedKeys,
    focusedKey: focusedKey ?? (selectedKeys.length === 1 ? selectedKeys[0] : focusedKey),
  };
}
