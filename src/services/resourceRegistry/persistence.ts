import { exists, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { useConfigStore } from "@/store/configStore";
import {
  CUSTOM_UNIT_GLOBAL_MIGRATED_KEY,
  readBundledCustomUnitRegistry,
  readWorkspaceCustomUnitRegistry,
  type CustomUnitMigrationResult,
} from "./migrateCustomUnit";
import {
  GLOBAL_REGISTRY_STORE_KEY,
  WORKSPACE_REGISTRY_FILENAME,
  createEmptyRegistryDocument,
  type ResourceRegistryDocument,
} from "./types";

function parseRegistryDocument(raw: string): ResourceRegistryDocument {
  const parsed = JSON.parse(raw) as ResourceRegistryDocument;
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries)) {
    throw new Error("Invalid resource registry document");
  }
  return parsed;
}

const pendingMigrationNotices: string[] = [];
const pendingMigrationWarnings: string[] = [];

function queueMigrationNotice(migration: CustomUnitMigrationResult, target: "global" | "workspace") {
  const label = target === "global" ? "global registry" : "resource_registry.json";
  pendingMigrationNotices.push(
    `Migrated ${migration.doc.entries.length} entries from custom_unit.json into ${label}`,
  );
  for (const warning of migration.warnings) {
    pendingMigrationWarnings.push(warning);
  }
}

export function drainRegistryMigrationNotices(): string[] {
  const notices = [...pendingMigrationNotices];
  pendingMigrationNotices.length = 0;
  return notices;
}

export function drainRegistryMigrationWarnings(): string[] {
  const warnings = [...pendingMigrationWarnings];
  pendingMigrationWarnings.length = 0;
  return warnings;
}

export async function loadGlobalRegistry(): Promise<ResourceRegistryDocument> {
  const store = useConfigStore.getState();
  if (!store.store) {
    await store.initStore();
  }

  const existing = await useConfigStore.getState().getSetting<ResourceRegistryDocument>(
    GLOBAL_REGISTRY_STORE_KEY,
  );
  if (existing && existing.entries.length > 0) {
    return existing;
  }

  const alreadyMigrated = await useConfigStore
    .getState()
    .getSetting<boolean>(CUSTOM_UNIT_GLOBAL_MIGRATED_KEY);
  if (!alreadyMigrated) {
    const migration = await readBundledCustomUnitRegistry();
    if (migration) {
      await saveGlobalRegistry(migration.doc);
      await useConfigStore.getState().setSetting(CUSTOM_UNIT_GLOBAL_MIGRATED_KEY, true);
      queueMigrationNotice(migration, "global");
      return migration.doc;
    }
    await useConfigStore.getState().setSetting(CUSTOM_UNIT_GLOBAL_MIGRATED_KEY, true);
  }

  return existing ?? createEmptyRegistryDocument();
}

export async function saveGlobalRegistry(doc: ResourceRegistryDocument): Promise<void> {
  const store = useConfigStore.getState();
  if (!store.store) {
    await store.initStore();
  }
  await useConfigStore.getState().setSetting(GLOBAL_REGISTRY_STORE_KEY, doc);
}

export function workspaceRegistryPath(workspacePath: string): Promise<string> {
  return join(workspacePath, WORKSPACE_REGISTRY_FILENAME);
}

export async function loadWorkspaceRegistry(
  workspacePath: string,
): Promise<ResourceRegistryDocument> {
  if (!workspacePath.trim()) {
    return createEmptyRegistryDocument();
  }
  const filePath = await workspaceRegistryPath(workspacePath);
  if (await exists(filePath)) {
    const raw = await readTextFile(filePath);
    return parseRegistryDocument(raw);
  }

  const migration = await readWorkspaceCustomUnitRegistry(workspacePath);
  if (migration) {
    await saveWorkspaceRegistry(workspacePath, migration.doc);
    queueMigrationNotice(migration, "workspace");
    return migration.doc;
  }

  return createEmptyRegistryDocument();
}

export async function saveWorkspaceRegistry(
  workspacePath: string,
  doc: ResourceRegistryDocument,
): Promise<void> {
  if (!workspacePath.trim()) {
    throw new Error("Workspace path is required to save registry");
  }
  const filePath = await workspaceRegistryPath(workspacePath);
  const payload = JSON.stringify(doc, null, 2);
  await writeTextFile(filePath, payload);
}
