import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  lookupByHash,
  lookupBySeed,
  mergeRegistriesWithSource,
  removeWorkspaceEntry,
  upsertWorkspaceEntry,
  validateDocument,
} from "@/services/resourceRegistry/merge";
import {
  formatStageEntryIdNote,
} from "@/services/resourceRegistry/stageRegistrySync";
import {
  loadGlobalRegistry,
  loadWorkspaceRegistry,
  saveGlobalRegistry,
  saveWorkspaceRegistry,
  drainRegistryMigrationNotices,
  drainRegistryMigrationWarnings,
} from "@/services/resourceRegistry/persistence";
import {
  buildRegistryEntryFromSeed,
  createEmptyRegistryDocument,
  type MergedRegistryEntry,
  type RegisterResult,
  type ResourceRegistryCategory,
  type ResourceRegistryDocument,
  type ResourceRegistryEntry,
  type ValidationIssue,
} from "@/services/resourceRegistry/types";

export type RegistryViewSource = "merged" | "global" | "workspace";

export interface UseResourceRegistryResult {
  loading: boolean;
  error: string | null;
  globalDoc: ResourceRegistryDocument;
  workspaceDoc: ResourceRegistryDocument;
  mergedEntries: MergedRegistryEntry[];
  validationIssues: ValidationIssue[];
  viewSource: RegistryViewSource;
  setViewSource: (source: RegistryViewSource) => void;
  reload: () => Promise<void>;
  registerWorkspace: (input: {
    category: ResourceRegistryCategory;
    slot: string;
    seed: string;
    displayName?: string;
    notes?: string;
  }) => Promise<RegisterResult>;
  registerGlobal: (input: {
    category: ResourceRegistryCategory;
    slot: string;
    seed: string;
    displayName?: string;
    notes?: string;
  }) => Promise<RegisterResult>;
  updateWorkspaceEntry: (entry: ResourceRegistryEntry) => Promise<void>;
  deleteWorkspaceEntry: (entryId: string) => Promise<void>;
  promoteToGlobal: (entryId: string) => Promise<void>;
  importWorkspaceEntries: (entries: ResourceRegistryEntry[]) => Promise<void>;
  replaceWorkspaceDoc: (doc: ResourceRegistryDocument) => Promise<void>;
  replaceWorkspaceStageByEntryId: (
    stageEntryId: number,
    entries: ResourceRegistryEntry[],
  ) => Promise<boolean>;
  lookupMergedBySeed: (
    category: ResourceRegistryCategory,
    slot: string,
    seed: string,
  ) => MergedRegistryEntry | undefined;
  lookupMergedByHash: (
    category: ResourceRegistryCategory,
    slot: string,
    hashInt32: number,
  ) => MergedRegistryEntry | undefined;
}

function registerInDoc(
  doc: ResourceRegistryDocument,
  input: {
    category: ResourceRegistryCategory;
    slot: string;
    seed: string;
    displayName?: string;
    notes?: string;
  },
): { doc: ResourceRegistryDocument; result: RegisterResult } {
  const trimmedSeed = input.seed.trim();
  if (!trimmedSeed) {
    return { doc, result: { ok: false, reason: "empty_seed" } };
  }

  const entry = buildRegistryEntryFromSeed({
    category: input.category,
    slot: input.slot,
    seed: trimmedSeed,
    displayName: input.displayName,
    notes: input.notes,
  });

  const duplicate = doc.entries.find(
    (row) =>
      row.category === entry.category &&
      row.slot === entry.slot &&
      row.hashInt32 === entry.hashInt32 &&
      row.seed !== entry.seed,
  );
  if (duplicate) {
    return {
      doc,
      result: { ok: false, reason: "duplicate_hash", existingEntryId: duplicate.id },
    };
  }

  const next = upsertWorkspaceEntry(doc, entry);
  return { doc: next, result: { ok: true, entry } };
}

export function useResourceRegistry(workspacePath: string | null): UseResourceRegistryResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [globalDoc, setGlobalDoc] = useState<ResourceRegistryDocument>(createEmptyRegistryDocument());
  const [workspaceDoc, setWorkspaceDoc] = useState<ResourceRegistryDocument>(
    createEmptyRegistryDocument(),
  );
  const [viewSource, setViewSource] = useState<RegistryViewSource>("merged");

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [global, workspace] = await Promise.all([
        loadGlobalRegistry(),
        workspacePath ? loadWorkspaceRegistry(workspacePath) : Promise.resolve(createEmptyRegistryDocument()),
      ]);
      setGlobalDoc(global);
      setWorkspaceDoc(workspace);
      const notices = drainRegistryMigrationNotices();
      for (const message of notices) {
        toast.success(message);
      }
      for (const message of drainRegistryMigrationWarnings()) {
        toast.warning(message);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [workspacePath]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const mergedEntries = useMemo(
    () => mergeRegistriesWithSource(globalDoc, workspaceDoc),
    [globalDoc, workspaceDoc],
  );

  const validationIssues = useMemo(() => {
    const merged = { version: 1 as const, entries: mergedEntries.map(({ sourceLayer: _s, ...e }) => e) };
    return validateDocument(merged);
  }, [mergedEntries]);

  const registerWorkspace = useCallback(
    async (input: {
      category: ResourceRegistryCategory;
      slot: string;
      seed: string;
      displayName?: string;
      notes?: string;
    }): Promise<RegisterResult> => {
      if (!workspacePath) {
        return { ok: false, reason: "empty_seed" };
      }
      const { doc, result } = registerInDoc(workspaceDoc, input);
      if (!result.ok) return result;
      await saveWorkspaceRegistry(workspacePath, doc);
      setWorkspaceDoc(doc);
      return result;
    },
    [workspaceDoc, workspacePath],
  );

  const registerGlobal = useCallback(
    async (input: {
      category: ResourceRegistryCategory;
      slot: string;
      seed: string;
      displayName?: string;
      notes?: string;
    }): Promise<RegisterResult> => {
      const { doc, result } = registerInDoc(globalDoc, input);
      if (!result.ok) return result;
      await saveGlobalRegistry(doc);
      setGlobalDoc(doc);
      return result;
    },
    [globalDoc],
  );

  const updateWorkspaceEntry = useCallback(
    async (entry: ResourceRegistryEntry) => {
      if (!workspacePath) return;
      const next = upsertWorkspaceEntry(workspaceDoc, {
        ...entry,
        updatedAt: new Date().toISOString(),
      });
      await saveWorkspaceRegistry(workspacePath, next);
      setWorkspaceDoc(next);
    },
    [workspaceDoc, workspacePath],
  );

  const deleteWorkspaceEntry = useCallback(
    async (entryId: string) => {
      if (!workspacePath) return;
      const next = removeWorkspaceEntry(workspaceDoc, entryId);
      await saveWorkspaceRegistry(workspacePath, next);
      setWorkspaceDoc(next);
    },
    [workspaceDoc, workspacePath],
  );

  const promoteToGlobal = useCallback(
    async (entryId: string) => {
      const entry = workspaceDoc.entries.find((row) => row.id === entryId);
      if (!entry) return;
      const { doc: nextGlobal } = registerInDoc(globalDoc, entry);
      await saveGlobalRegistry(nextGlobal);
      setGlobalDoc(nextGlobal);
    },
    [globalDoc, workspaceDoc.entries],
  );

  const importWorkspaceEntries = useCallback(
    async (entries: ResourceRegistryEntry[]) => {
      if (!workspacePath) return;
      let next = workspaceDoc;
      for (const entry of entries) {
        next = upsertWorkspaceEntry(next, entry);
      }
      await saveWorkspaceRegistry(workspacePath, next);
      setWorkspaceDoc(next);
    },
    [workspaceDoc, workspacePath],
  );

  const replaceWorkspaceDoc = useCallback(
    async (doc: ResourceRegistryDocument) => {
      if (!workspacePath) return;
      await saveWorkspaceRegistry(workspacePath, doc);
      setWorkspaceDoc(doc);
    },
    [workspacePath],
  );

  const replaceWorkspaceStageByEntryId = useCallback(
    async (stageEntryId: number, entries: ResourceRegistryEntry[]): Promise<boolean> => {
      if (!workspacePath) {
        return false;
      }
      const note = formatStageEntryIdNote(stageEntryId);
      let next: ResourceRegistryDocument = {
        ...workspaceDoc,
        entries: workspaceDoc.entries.filter(
          (row) => !(row.category === "stage" && row.notes === note),
        ),
      };
      for (const entry of entries) {
        next = upsertWorkspaceEntry(next, entry);
      }
      await saveWorkspaceRegistry(workspacePath, next);
      setWorkspaceDoc(next);
      return true;
    },
    [workspaceDoc, workspacePath],
  );

  const mergedDoc = useMemo(
    () => ({
      version: 1 as const,
      entries: mergedEntries.map(({ sourceLayer: _s, ...entry }) => entry),
    }),
    [mergedEntries],
  );

  const lookupMergedBySeed = useCallback(
    (category: ResourceRegistryCategory, slot: string, seed: string) => {
      const entry = lookupBySeed(mergedDoc, category, slot, seed);
      if (!entry) return undefined;
      return mergedEntries.find((row) => row.id === entry.id);
    },
    [mergedDoc, mergedEntries],
  );

  const lookupMergedByHash = useCallback(
    (category: ResourceRegistryCategory, slot: string, hashInt32: number) => {
      const entry = lookupByHash(mergedDoc, category, slot, hashInt32);
      if (!entry) return undefined;
      return mergedEntries.find((row) => row.id === entry.id);
    },
    [mergedDoc, mergedEntries],
  );

  return {
    loading,
    error,
    globalDoc,
    workspaceDoc,
    mergedEntries,
    validationIssues,
    viewSource,
    setViewSource,
    reload,
    registerWorkspace,
    registerGlobal,
    updateWorkspaceEntry,
    deleteWorkspaceEntry,
    promoteToGlobal,
    importWorkspaceEntries,
    replaceWorkspaceDoc,
    replaceWorkspaceStageByEntryId,
    lookupMergedBySeed,
    lookupMergedByHash,
  };
}
