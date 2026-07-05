import { useConfigStore } from "@/store/configStore";
import { normalizePathForStar } from "../../utils/fileTreeStars";
import type { MotionInventoryCategory } from "./motionFolderEditorUtils";

export const MOTION_FOLDER_EDITOR_STORE_KEY = "testEditor.motionFolder.v1";

export type MotionFolderPackSelectionState = {
  focusedKey: string | null;
  selectedKeys: string[];
  category: MotionInventoryCategory | "all";
  searchQuery: string;
};

export type MotionFolderWorkspaceState = {
  folderPath: string;
  packSelections?: Record<string, MotionFolderPackSelectionState>;
};

export type MotionFolderEditorStoreDocument = Record<string, MotionFolderWorkspaceState>;

export const DEFAULT_MOTION_FOLDER_PACK_SELECTION: MotionFolderPackSelectionState = {
  focusedKey: null,
  selectedKeys: [],
  category: "all",
  searchQuery: "",
};

function workspaceStoreKey(workspaceRoot: string): string {
  return normalizePathForStar(workspaceRoot.trim());
}

function isCategory(value: unknown): value is MotionInventoryCategory | "all" {
  return value === "all" || value === "folders" || value === "items";
}

function parsePackSelection(raw: unknown): MotionFolderPackSelectionState | null {
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

function parseWorkspaceState(raw: unknown): MotionFolderWorkspaceState | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const folderPath = typeof record.folderPath === "string" ? record.folderPath.trim() : "";
  if (!folderPath) return null;

  const packSelections: Record<string, MotionFolderPackSelectionState> = {};
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

async function readStoreDocument(): Promise<MotionFolderEditorStoreDocument> {
  const raw = await useConfigStore.getState().getSetting<MotionFolderEditorStoreDocument>(
    MOTION_FOLDER_EDITOR_STORE_KEY,
  );
  if (!raw || typeof raw !== "object") return {};
  return raw;
}

async function writeStoreDocument(document: MotionFolderEditorStoreDocument): Promise<void> {
  await useConfigStore.getState().setSetting(MOTION_FOLDER_EDITOR_STORE_KEY, document);
}

export async function getMotionFolderWorkspaceState(
  workspaceRoot: string,
): Promise<MotionFolderWorkspaceState | undefined> {
  const key = workspaceStoreKey(workspaceRoot);
  if (!key) return undefined;
  const document = await readStoreDocument();
  const parsed = parseWorkspaceState(document[key]);
  return parsed ?? undefined;
}

export async function rememberMotionFolderPath(
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

export async function getMotionFolderPackSelection(
  workspaceRoot: string,
  packKey: string,
): Promise<MotionFolderPackSelectionState | undefined> {
  const workspace = await getMotionFolderWorkspaceState(workspaceRoot);
  if (!workspace?.packSelections) return undefined;
  return workspace.packSelections[packKey] ?? undefined;
}

export async function rememberMotionFolderPackSelection(
  workspaceRoot: string,
  packKey: string,
  selection: MotionFolderPackSelectionState,
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

export function sanitizeMotionFolderPackSelection(
  selection: MotionFolderPackSelectionState,
  validKeys: Set<string>,
): MotionFolderPackSelectionState {
  const selectedKeys = selection.selectedKeys.filter((key) => validKeys.has(key));
  const focusedKey = selection.focusedKey && validKeys.has(selection.focusedKey) ? selection.focusedKey : null;
  return {
    category: selection.category,
    searchQuery: selection.searchQuery,
    selectedKeys,
    focusedKey: focusedKey ?? (selectedKeys.length === 1 ? selectedKeys[0] : focusedKey),
  };
}
