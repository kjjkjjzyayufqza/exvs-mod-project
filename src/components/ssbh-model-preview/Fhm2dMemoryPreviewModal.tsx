import { open } from "@tauri-apps/plugin-dialog";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertTriangle,
  Boxes,
  CheckSquare,
  ChevronRight,
  File,
  FileArchive,
  Folder,
  FolderTree,
  Layers3,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useConfigStore } from "@/store/configStore";
import {
  DialogLastPathKey,
  getDialogDefaultPath,
  rememberDialogSelection,
} from "@/utils/dialogLastPath";
import {
  loadCharacterIdMemoryPreviewOptions,
} from "./fhm2dMemoryPreviewCharacterTable";
import {
  buildSsbhPreviewBundleFromMemory,
  createFhm2dMemorySession,
  defaultFhm2dMemoryFormat,
  disposeFhm2dMemorySession,
  listFhm2dMemoryPreviewCandidates,
  renameFhm2dMemoryEntry,
} from "./fhm2dMemoryPreviewService";
import type {
  CharacterIdMemoryPreviewOption,
  Fhm2dMemorySessionSummary,
  Fhm2dPreviewCandidate,
} from "./fhm2dMemoryPreviewTypes";
import {
  flattenVirtualTree,
  groupPreviewCandidatesByFolder,
  indexVirtualTreeEntries,
  settleWithConcurrencyLimit,
  toggleCandidateGroupSelection,
} from "./fhm2dMemoryPreviewUtils";
import { useSsbhModelPreview } from "./SsbhModelPreviewContext";

const MEMORY_PREVIEW_BUNDLE_BUILD_CONCURRENCY = 3;
const MEMORY_PREVIEW_DIMENSIONS = {
  width: 1460,
  height: 860,
  minWidth: 920,
  minHeight: 620,
};

type MemoryWorkspaceProgress = {
  stage: "build-bundles";
  done: number;
  total: number;
  currentLabel: string | null;
};

type CharacterIdPickerState =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      filePath: string;
      availableCount: number;
      options: CharacterIdMemoryPreviewOption[];
    };

function formatBytes(size: number | null): string {
  if (!size || size <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 100 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function findFirstEntryId(session: Fhm2dMemorySessionSummary | null): string | null {
  const first = session?.virtualTree[0];
  return first?.id ?? null;
}

export function Fhm2dMemoryPreviewModal() {
  const { t } = useTranslation("ssbh-modals");
  const p = useSsbhModelPreview();
  const obDplCachePath = useConfigStore((state) => state.obDplCachePath ?? "");
  const session = p.memoryWorkspaceSession;
  const sourcePath = p.memoryWorkspaceSourcePath;
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<number | null>(null);
  const [characterIdPickerState, setCharacterIdPickerState] = useState<CharacterIdPickerState>({
    status: "idle",
  });
  const [characterIdSearchText, setCharacterIdSearchText] = useState("");
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(new Set());
  const [treeSearchText, setTreeSearchText] = useState("");
  const [modelRelatedOnly, setModelRelatedOnly] = useState(false);
  const [completeOnly, setCompleteOnly] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [renameVirtualPath, setRenameVirtualPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [workspaceProgress, setWorkspaceProgress] = useState<MemoryWorkspaceProgress | null>(null);
  const [isPending, startTransition] = useTransition();
  const characterIdViewportRef = useRef<HTMLDivElement | null>(null);
  const treeViewportRef = useRef<HTMLDivElement | null>(null);
  const groupsViewportRef = useRef<HTMLDivElement | null>(null);
  const candidatesViewportRef = useRef<HTMLDivElement | null>(null);
  const memoryModalWasOpenRef = useRef(false);
  /** Tracks when to apply default "select all" after session / candidate list changes (not on rename-driven updates). */
  const memorySelectionBaselineRef = useRef<{ sessionId: string | null; candidateCount: number }>({
    sessionId: null,
    candidateCount: 0,
  });
  const deferredCharacterIdSearchText = useDeferredValue(characterIdSearchText);
  const deferredTreeSearchText = useDeferredValue(treeSearchText);

  const virtualEntriesById = useMemo(
    () => indexVirtualTreeEntries(session?.virtualTree ?? []),
    [session?.virtualTree],
  );

  // Explicit clear only: closing the dialog does not call this; workspace state stays in context + Rust until cleared or replaced.
  const disposeCurrentSession = useCallback(async () => {
    if (!session?.sessionId) {
      return;
    }
    const disposeId = session.sessionId;
    const sessionStillReferenced = p.previewInstances.some(
      (instance) => instance.bundle.sourceSessionId === disposeId,
    );
    p.setMemoryWorkspaceSession(null);
    p.setMemoryWorkspaceSourcePath(null);
    setActiveEntryId(null);
    setSelectedCandidateIds(new Set());
    setCollapsedFolderIds(new Set());
    setRenameName("");
    setRenameVirtualPath("");
    setWorkspaceProgress(null);
    if (!sessionStillReferenced) {
      await disposeFhm2dMemorySession(disposeId).catch(() => {});
    }
  }, [p.previewInstances, session?.sessionId]);

  useEffect(() => {
    if (!p.memoryPreviewModalOpen) {
      return;
    }
    if (!session) {
      setActiveEntryId(null);
    }
  }, [p.memoryPreviewModalOpen, session]);

  useEffect(() => {
    const sid = session?.sessionId ?? null;
    const candidates = session?.previewCandidates ?? [];
    const count = candidates.length;

    if (!sid) {
      memorySelectionBaselineRef.current = { sessionId: null, candidateCount: 0 };
      return;
    }

    const baseline = memorySelectionBaselineRef.current;
    if (count === 0) {
      if (baseline.sessionId !== sid) {
        memorySelectionBaselineRef.current = { sessionId: sid, candidateCount: 0 };
      }
      return;
    }

    const sessionBecame = baseline.sessionId !== sid;
    const firstBatchLoaded =
      baseline.sessionId === sid && baseline.candidateCount === 0 && count > 0;

    if (sessionBecame || firstBatchLoaded) {
      setSelectedCandidateIds(new Set(candidates.map((c) => c.id)));
    }

    memorySelectionBaselineRef.current = { sessionId: sid, candidateCount: count };
  }, [session?.sessionId, session?.previewCandidates]);

  useEffect(() => {
    const wasOpen = memoryModalWasOpenRef.current;
    memoryModalWasOpenRef.current = p.memoryPreviewModalOpen;
    if (!p.memoryPreviewModalOpen) {
      return;
    }
    if (wasOpen) {
      return;
    }
    const sid = session?.sessionId;
    const path = sourcePath?.trim();
    if (!sid || !path) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const candidates = await listFhm2dMemoryPreviewCandidates(sid);
        if (cancelled) {
          return;
        }
        p.setMemoryWorkspaceSession((prev) =>
          prev && prev.sessionId === sid ? { ...prev, previewCandidates: candidates } : prev,
        );
      } catch (e) {
        if (cancelled) {
          return;
        }
        const msg = String(e);
        const path = sourcePath?.trim();
        const sessionMissing =
          msg.includes("memory session not found") || msg.includes("FHM2D memory session not found");
        if (path && sessionMissing) {
          try {
            setBusy(true);
            const created = await createFhm2dMemorySession({
              sourcePath: path,
              format: defaultFhm2dMemoryFormat(),
            });
            if (cancelled) {
              return;
            }
            p.setMemoryWorkspaceSession(created);
            p.setMemoryWorkspaceSourcePath(path);
            setActiveEntryId(findFirstEntryId(created));
            setCollapsedFolderIds(new Set());
            toast.success(t("memory.restored"));
          } catch (e2) {
            toast.error(String(e2));
          } finally {
            if (!cancelled) {
              setBusy(false);
            }
          }
          return;
        }
        toast.error(t("memory.sessionUnreachable"), {
          description: msg,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    p.memoryPreviewModalOpen,
    session?.sessionId,
    sourcePath,
    p.setMemoryWorkspaceSession,
    p.setMemoryWorkspaceSourcePath,
  ]);

  useEffect(() => {
    if (!session) {
      setActiveEntryId(null);
      return;
    }
    if (!activeEntryId || !virtualEntriesById[activeEntryId]) {
      setActiveEntryId(findFirstEntryId(session));
    }
  }, [session, activeEntryId, virtualEntriesById]);

  useEffect(() => {
    if (!p.memoryPreviewModalOpen) {
      return;
    }
    const workspaceRoot = p.workspaceRoot?.trim() ?? "";
    if (!workspaceRoot) {
      setCharacterIdPickerState({
        status: "error",
        message: t("memory.workspaceRequired"),
      });
      return;
    }
    let cancelled = false;
    setCharacterIdPickerState({ status: "loading" });
    void (async () => {
      try {
        const loaded = await loadCharacterIdMemoryPreviewOptions({
          workspaceRoot,
          obDplCachePath,
          query: deferredCharacterIdSearchText,
        });
        if (!cancelled) {
          setCharacterIdPickerState({
            status: "ready",
            filePath: loaded.filePath,
            availableCount: loaded.availableCount,
            options: loaded.rows,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setCharacterIdPickerState({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [p.memoryPreviewModalOpen, p.workspaceRoot, obDplCachePath, deferredCharacterIdSearchText]);

  useEffect(() => {
    if (characterIdPickerState.status !== "ready") {
      return;
    }
    const normalizedSourcePath = sourcePath?.trim();
    if (!normalizedSourcePath) {
      setSelectedCharacterId(null);
      return;
    }
    const match =
      characterIdPickerState.options.find(
        (option) => option.sourcePath.trim().toLowerCase() === normalizedSourcePath.toLowerCase(),
      ) ?? null;
    setSelectedCharacterId(match?.characterId ?? null);
  }, [characterIdPickerState, sourcePath]);

  const openSourcePath = useCallback(
    async (path: string) => {
      setBusy(true);
      try {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (session?.sessionId) {
          await disposeCurrentSession();
        }
        const created = await createFhm2dMemorySession({
          sourcePath: path,
          format: defaultFhm2dMemoryFormat(),
        });
        p.setMemoryWorkspaceSourcePath(path);
        p.setMemoryWorkspaceSession(created);
        setActiveEntryId(findFirstEntryId(created));
        setCollapsedFolderIds(new Set());
        setRenameName("");
        setRenameVirtualPath("");
        if (created.namingWarning) {
          toast.error(t("memory.namingWarningToast"), {
            description: created.namingWarning,
          });
        } else {
          toast.success(t("memory.loaded"));
        }
      } catch (e) {
        toast.error(String(e));
      } finally {
        setBusy(false);
      }
    },
    [disposeCurrentSession, session?.sessionId],
  );

  const openFhm2dFile = useCallback(async () => {
    const selected = await open({
      directory: false,
      multiple: false,
      defaultPath: getDialogDefaultPath(DialogLastPathKey.ssbhPreviewOpenFhm2dMemory, p.workspaceRoot),
      filters: [{ name: "FHM2D", extensions: ["fhm2d"] }],
    });
    if (typeof selected !== "string" || !selected.trim()) {
      return;
    }
    const nextPath = selected.trim();
    rememberDialogSelection(DialogLastPathKey.ssbhPreviewOpenFhm2dMemory, nextPath, "file");
    await openSourcePath(nextPath);
  }, [openSourcePath, p.workspaceRoot]);

  const reloadSession = useCallback(async () => {
    if (!sourcePath) {
      throw new Error("Open an FHM2D file before reloading the memory workspace.");
    }
    await openSourcePath(sourcePath);
  }, [openSourcePath, sourcePath]);

  const closeModal = useCallback(() => {
    p.setMemoryPreviewModalOpen(false);
  }, [p]);

  const filteredCharacterIdOptions = useMemo(() => {
    if (characterIdPickerState.status !== "ready") {
      return [];
    }
    return characterIdPickerState.options;
  }, [characterIdPickerState]);

  const characterIdVirtualizer = useVirtualizer({
    count: filteredCharacterIdOptions.length,
    getScrollElement: () => characterIdViewportRef.current,
    estimateSize: () => 68,
    overscan: 10,
  });

  const visibleTreeRows = useMemo(
    () =>
      flattenVirtualTree(
        session?.virtualTree ?? [],
        collapsedFolderIds,
        deferredTreeSearchText,
        modelRelatedOnly,
      ),
    [session?.virtualTree, collapsedFolderIds, deferredTreeSearchText, modelRelatedOnly],
  );

  const treeVirtualizer = useVirtualizer({
    count: visibleTreeRows.length,
    getScrollElement: () => treeViewportRef.current,
    estimateSize: () => 36,
    overscan: 14,
  });

  const filteredCandidates = useMemo(() => {
    const candidates = session?.previewCandidates ?? [];
    if (!completeOnly) {
      return candidates;
    }
    return candidates.filter((candidate) => candidate.complete);
  }, [completeOnly, session?.previewCandidates]);

  const candidateVirtualizer = useVirtualizer({
    count: filteredCandidates.length,
    getScrollElement: () => candidatesViewportRef.current,
    estimateSize: () => 88,
    overscan: 16,
  });

  const groupedCandidates = useMemo(
    () => groupPreviewCandidatesByFolder(filteredCandidates),
    [filteredCandidates],
  );

  const groupedCandidateVirtualizer = useVirtualizer({
    count: groupedCandidates.length,
    getScrollElement: () => groupsViewportRef.current,
    estimateSize: () => 52,
    overscan: 10,
  });

  const candidateById = useMemo(() => {
    const next = new Map<string, Fhm2dPreviewCandidate>();
    for (const candidate of filteredCandidates) {
      next.set(candidate.id, candidate);
    }
    return next;
  }, [filteredCandidates]);

  const candidateByEntryId = useMemo(() => {
    const next = new Map<string, Fhm2dPreviewCandidate>();
    const nextByVirtualPath = new Map<string, Fhm2dPreviewCandidate>();
    for (const candidate of filteredCandidates) {
      next.set(candidate.modlEntryId, candidate);
      nextByVirtualPath.set(candidate.modlVirtualPath, candidate);
    }
    return { byEntryId: next, byVirtualPath: nextByVirtualPath };
  }, [filteredCandidates]);

  const activeEntry = activeEntryId ? virtualEntriesById[activeEntryId] ?? null : null;
  const activeCandidate = useMemo(() => {
    if (!activeEntry) {
      return null;
    }
    return (
      candidateByEntryId.byEntryId.get(activeEntry.id) ??
      candidateByEntryId.byVirtualPath.get(activeEntry.virtualPath) ??
      null
    );
  }, [activeEntry, candidateByEntryId]);

  useEffect(() => {
    if (!activeEntry || activeEntry.kind !== "file") {
      setRenameName("");
      setRenameVirtualPath("");
      return;
    }
    setRenameName(activeEntry.name);
    setRenameVirtualPath(activeEntry.relativePath);
  }, [activeEntry?.id]);

  const applyRename = useCallback(async () => {
    if (!session || !activeEntry || activeEntry.kind !== "file") {
      throw new Error("Select a file entry before renaming.");
    }
    setBusy(true);
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const impact = await renameFhm2dMemoryEntry({
        sessionId: session.sessionId,
        entryId: activeEntry.id,
        nextName: renameName.trim() || undefined,
        nextVirtualPath: renameVirtualPath.trim() || undefined,
      });
      p.setMemoryWorkspaceSession((prev) =>
        prev
          ? {
              ...prev,
              previewCandidates: impact.previewCandidates,
              virtualTree: impact.virtualTree,
              renameRevision: impact.renameRevision,
            }
          : prev,
      );
      startTransition(() => {
        setSelectedCandidateIds((prev) => {
          const next = new Set<string>();
          const validIds = new Set(impact.previewCandidates.map((candidate) => candidate.id));
          for (const id of prev) {
            if (validIds.has(id)) {
              next.add(id);
            }
          }
          return next;
        });
      });
      toast.success(t("memory.renameApplied"), {
        description: impact.nextVirtualPath,
      });
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  }, [activeEntry, renameName, renameVirtualPath, session, p.setMemoryWorkspaceSession]);

  const buildSelectedBundles = useCallback(async () => {
    if (!session) {
      throw new Error("Open an FHM2D file before loading memory preview bundles.");
    }
    const selected = [...selectedCandidateIds]
      .map((id) => candidateById.get(id) ?? null)
      .filter((candidate): candidate is Fhm2dPreviewCandidate => candidate !== null);
    if (selected.length === 0) {
      throw new Error("Select at least one .numdlb candidate.");
    }
    setWorkspaceProgress({
      stage: "build-bundles",
      done: 0,
      total: selected.length,
      currentLabel: selected[0]?.displayLabel ?? null,
    });
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const settled = await settleWithConcurrencyLimit(
      selected,
      MEMORY_PREVIEW_BUNDLE_BUILD_CONCURRENCY,
      (candidate) =>
        buildSsbhPreviewBundleFromMemory({
          sessionId: session.sessionId,
          modlVirtualPath: candidate.modlVirtualPath,
        }),
      ({ completed, item }) =>
        setWorkspaceProgress({
          stage: "build-bundles",
          done: completed,
          total: selected.length,
          currentLabel: item.displayLabel,
        }),
    );
    const bundles = settled.successes.map((result) => result.value);
    const failed = settled.failures.map((result) => String(result.error));
    if (failed.length > 0) {
      toast.error(t("memory.candidatesFailed"), {
        description: failed.slice(0, 3).join("\n"),
      });
    }
    if (bundles.length === 0) {
      throw new Error("No selected memory candidate could be loaded into the preview.");
    }
    return bundles;
  }, [candidateById, selectedCandidateIds, session]);

  const applySelectionToPreview = useCallback(
    async (mode: "replace" | "append") => {
      setBusy(true);
      try {
        const bundles = await buildSelectedBundles();
        if (mode === "replace") {
          p.loadMemoryPreviewBundles(bundles);
          toast.success(t("memory.appliedToView"));
        } else {
          p.appendMemoryPreviewBundles(bundles);
          toast.success(t("memory.appendedToView"));
        }
        closeModal();
      } catch (e) {
        toast.error(String(e));
      } finally {
        setWorkspaceProgress(null);
        setBusy(false);
      }
    },
    [buildSelectedBundles, closeModal, p],
  );

  if (!p.memoryPreviewModalOpen) {
    return null;
  }

  return (
    <AppRndModalShell
      titleId="memory-preview-workspace-title"
      title={t("memory.title")}
      subtitle={t("memory.subtitle")}
      headerIcon={<FileArchive className="h-5 w-5 text-primary" />}
      dimensions={MEMORY_PREVIEW_DIMENSIONS}
      storageKey="app.rnd-size.memory-preview-workspace"
      onClose={closeModal}
      closeDisabled={busy || isPending || Boolean(workspaceProgress)}
    >
      <div className="shrink-0 border-b bg-muted/20 px-4 py-3">
        <div className="flex flex-wrap items-center justify-end gap-2">
              <Button type="button" size="sm" onClick={() => void openFhm2dFile()} disabled={busy}>
                <FileArchive className="mr-1.5 h-3.5 w-3.5" />
                {t("memory.openFhm2d")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void reloadSession()}
                disabled={busy || !sourcePath}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                {t("memory.reloadSession")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void reloadSession()}
                disabled={busy || !sourcePath}
              >
                <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                {t("memory.autoRename")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void applySelectionToPreview("replace")}
                disabled={busy || p.previewBusy || selectedCandidateIds.size === 0}
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                {t("memory.applyToView")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void applySelectionToPreview("append")}
                disabled={busy || p.previewBusy || selectedCandidateIds.size === 0}
              >
                <Layers3 className="mr-1.5 h-3.5 w-3.5" />
                {t("memory.appendToView")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => void disposeCurrentSession()}
                disabled={busy || !session}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                {t("memory.clearSession")}
              </Button>
        </div>
        {session ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
            <span>{t("memory.source")} <span data-i18n-ignore="">{session.sourceName}</span></span>
            <span>{t("memory.format")} <span data-i18n-ignore="">{session.format ?? "auto"}</span></span>
            <span>{t("memory.renameRev")} {session.renameRevision}</span>
            <span>{t("memory.previewCandidates", { count: session.previewCandidates.length })}</span>
            {session.namingWarning ? (
              <span className="text-amber-600 dark:text-amber-400">{t("memory.namingWarning")}</span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(300px,1.1fr)_minmax(360px,1fr)_minmax(360px,1.1fr)]">
          <section className="flex min-h-0 flex-col border-r">
            <div className="shrink-0 border-b px-4 py-3">
              <div className="mb-2 flex items-center gap-2">
                <FileArchive className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">{t("memory.characterId")}</h3>
              </div>
              <div className="space-y-2">
                <div className="rounded-lg border bg-muted/15 px-3 py-2 text-[10px] text-muted-foreground">
                  {characterIdPickerState.status === "loading" ? (
                    <div>{t("memory.loadingCharacterTable")}</div>
                  ) : null}
                  {characterIdPickerState.status === "error" ? (
                    <div className="text-destructive">{characterIdPickerState.message}</div>
                  ) : null}
                  {characterIdPickerState.status === "ready" ? (
                    <div className="space-y-1">
                      <div className="break-all">{t("memory.source")} <span data-i18n-ignore="">{characterIdPickerState.filePath}</span></div>
                      <div>
                        {t("memory.loadableRows", {
                          available: characterIdPickerState.availableCount,
                          total: characterIdPickerState.options.length,
                        })}
                      </div>
                      <div className="break-all">
                        {t("memory.sourceRoot")}{" "}
                        {obDplCachePath.trim() ? (
                          <span data-i18n-ignore="">{obDplCachePath}</span>
                        ) : (
                          t("memory.cachePathMissing")
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={characterIdSearchText}
                    onChange={(event) => {
                      const next = event.target.value;
                      startTransition(() => setCharacterIdSearchText(next));
                    }}
                    placeholder={t("memory.searchCharacterId")}
                    className="h-8 pl-7 text-[11px]"
                    disabled={characterIdPickerState.status !== "ready"}
                  />
                </div>
              </div>
              <div className="mt-3">
                {characterIdPickerState.status === "ready" && filteredCharacterIdOptions.length === 0 ? (
                  <div className="rounded-lg border border-dashed px-3 py-4 text-[11px] text-muted-foreground">
                    {t("memory.noCharacterRows")}
                  </div>
                ) : null}
                {characterIdPickerState.status === "ready" && filteredCharacterIdOptions.length > 0 ? (
                  <div
                    ref={characterIdViewportRef}
                    className="max-h-[240px] overflow-y-auto rounded-lg border bg-muted/10"
                  >
                    <div
                      style={{
                        height: `${characterIdVirtualizer.getTotalSize()}px`,
                        position: "relative",
                        width: "100%",
                      }}
                    >
                      {characterIdVirtualizer.getVirtualItems().map((virtualRow) => {
                        const option = filteredCharacterIdOptions[virtualRow.index];
                        if (!option) {
                          return null;
                        }
                        const isSelected = option.characterId === selectedCharacterId;
                        const disabled = busy || option.disabledReason !== null;
                        return (
                          <button
                            key={`character-id-${option.characterId}-${option.modelHashHex}`}
                            type="button"
                            aria-label={t("memory.characterIdOption", { id: option.characterId })}
                            disabled={disabled}
                            className={cn(
                              "absolute left-0 right-0 flex flex-col items-start gap-1 border-l-[3px] px-3 py-2 text-left text-[11px] transition-colors",
                              isSelected
                                ? "border-l-primary bg-primary/10"
                                : "border-l-transparent hover:bg-muted/60",
                              disabled && "cursor-not-allowed opacity-70 hover:bg-transparent",
                            )}
                            style={{ transform: `translateY(${virtualRow.start}px)` }}
                            onClick={() => void openSourcePath(option.sourcePath)}
                            title={option.disabledReason ?? option.sourcePath}
                          >
                            <div className="flex w-full items-center justify-between gap-2">
                              <span className="font-medium">{t("memory.characterIdOption", { id: option.characterId })}</span>
                              {option.disabledReason ? (
                                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">
                                  {t("memory.disabled")}
                                </span>
                              ) : (
                                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-300">
                                  {t("memory.ready")}
                                </span>
                              )}
                            </div>
                            <div className="font-mono text-[10px] text-muted-foreground" data-i18n-ignore="">
                              {option.modelHashHex}.fhm2d
                            </div>
                            {option.disabledReason ? (
                              <div className="text-[10px] text-muted-foreground" data-i18n-ignore="">{option.disabledReason}</div>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="shrink-0 border-b px-4 py-3">
              <div className="mb-2 flex items-center gap-2">
                <FolderTree className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">{t("memory.virtualTree")}</h3>
              </div>
              <div className="space-y-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={treeSearchText}
                    onChange={(event) => {
                      const next = event.target.value;
                      startTransition(() => setTreeSearchText(next));
                    }}
                    placeholder={t("memory.searchTree")}
                    className="h-8 pl-7 text-[11px]"
                  />
                </div>
                <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Checkbox
                    checked={modelRelatedOnly}
                    onCheckedChange={(checked) =>
                      startTransition(() => setModelRelatedOnly(checked === true))
                    }
                  />
                  {t("memory.modelRelatedOnly")}
                </label>
              </div>
            </div>

            <div
              ref={treeViewportRef}
              className="min-h-0 flex-1 overflow-y-auto bg-muted/20 py-1 dark:bg-muted/10"
            >
              <div
                style={{
                  height: `${treeVirtualizer.getTotalSize()}px`,
                  position: "relative",
                  width: "100%",
                }}
              >
                {treeVirtualizer.getVirtualItems().map((virtualRow) => {
                  const row = visibleTreeRows[virtualRow.index];
                  if (!row) {
                    return null;
                  }
                  const node = row.node;
                  const folderOpen = !collapsedFolderIds.has(node.id);
                  const isActive = activeEntryId === node.id;
                  return (
                    <button
                      key={node.id}
                      type="button"
                      className={cn(
                        "absolute left-0 right-0 flex items-start gap-0 border-l-[3px] py-1.5 pr-2 text-left text-[11px] leading-tight transition-colors",
                        isActive
                          ? "border-l-primary bg-primary/10 text-foreground"
                          : "border-l-transparent hover:bg-muted/60",
                      )}
                      style={{
                        transform: `translateY(${virtualRow.start}px)`,
                        paddingLeft: `${6 + row.depth * 16}px`,
                      }}
                      onClick={() => {
                        setActiveEntryId(node.id);
                        if (node.kind === "folder") {
                          setCollapsedFolderIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(node.id)) {
                              next.delete(node.id);
                            } else {
                              next.add(node.id);
                            }
                            return next;
                          });
                        }
                      }}
                    >
                      <span className="flex h-5 w-4 shrink-0 items-center justify-center">
                        {node.kind === "folder" ? (
                          <ChevronRight
                            className={cn(
                              "h-3.5 w-3.5 text-muted-foreground transition-transform duration-150",
                              folderOpen && "rotate-90",
                            )}
                            aria-hidden
                          />
                        ) : null}
                      </span>
                      {node.kind === "folder" ? (
                        <Folder
                          className={cn(
                            "mt-0.5 h-3.5 w-3.5 shrink-0",
                            isActive ? "text-primary" : "text-sky-600/85 dark:text-sky-400/90",
                          )}
                          aria-hidden
                        />
                      ) : (
                        <File
                          className={cn(
                            "mt-0.5 h-3.5 w-3.5 shrink-0",
                            isActive ? "text-primary/90" : "text-muted-foreground/90",
                          )}
                          aria-hidden
                        />
                      )}
                      <div className="min-w-0 flex-1 pl-1">
                        <div className="flex items-center gap-1.5">
                          <span className={cn("truncate", isActive ? "font-medium" : "font-normal")} data-i18n-ignore="">
                            {node.name}
                          </span>
                          {node.hasReferenceIssue ? (
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                          ) : null}
                        </div>
                        <div className="truncate font-mono text-[9px] text-muted-foreground/95" data-i18n-ignore="">
                          {node.fileType ?? node.relativePath}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="flex min-h-0 flex-col border-r">
            <div className="shrink-0 border-b px-4 py-3">
              <div className="mb-2 flex items-center gap-2">
                <Boxes className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">{t("memory.detailsTitle")}</h3>
              </div>
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                {t("memory.detailsHelp")}
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {activeEntry ? (
                <div className="space-y-4 text-[11px]">
                  <div className="rounded-lg border bg-muted/15 p-3">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("memory.selectedEntry")}</div>
                    <div className="mt-1 break-all text-sm font-medium" data-i18n-ignore="">{activeEntry.virtualPath}</div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-muted-foreground" data-i18n-ignore="">
                      <div>Kind: {activeEntry.kind}</div>
                      <div>Type: {activeEntry.fileType ?? "folder"}</div>
                      <div>Size: {formatBytes(activeEntry.size)}</div>
                      <div>FileIndex: {activeEntry.fileIndex ?? "—"}</div>
                    </div>
                  </div>

                  {activeCandidate ? (
                    <div className="rounded-lg border bg-background p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {t("memory.numdlbCandidate")}
                          </div>
                          <div className="font-medium" data-i18n-ignore="">{activeCandidate.displayLabel}</div>
                        </div>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px]",
                            activeCandidate.complete
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : "bg-amber-500/10 text-amber-700 dark:text-amber-300",
                          )}
                        >
                          {activeCandidate.complete ? t("memory.loadable") : t("memory.needsFixes")}
                        </span>
                      </div>
                      <div className="space-y-1 text-[10px] text-muted-foreground" data-i18n-ignore="">
                        <div>Folder: {activeCandidate.folderRelativePath}</div>
                        <div>Mesh: {activeCandidate.meshVirtualPath ?? "Missing"}</div>
                        <div>Skeleton: {activeCandidate.skelVirtualPath ?? "Optional / missing"}</div>
                        <div>Materials: {activeCandidate.matlVirtualPaths.length}</div>
                        <div>Textures: {activeCandidate.nutexbVirtualPaths.length}</div>
                      </div>
                      {activeCandidate.issues.length > 0 ? (
                        <div className="mt-3 space-y-1">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("memory.issues")}</div>
                          {activeCandidate.issues.map((issue) => (
                            <div
                              key={issue}
                              className="rounded-md bg-amber-500/8 px-2 py-1 text-[10px] text-amber-700 dark:text-amber-300"
                              data-i18n-ignore=""
                            >
                              {issue}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="rounded-lg border bg-background p-3">
                    <div className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">{t("memory.renameInMemory")}</div>
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">{t("memory.fileName")}</Label>
                        <Input
                          value={renameName}
                          onChange={(event) => setRenameName(event.target.value)}
                          disabled={activeEntry.kind !== "file" || busy}
                          className="h-8 text-[11px]"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">{t("memory.virtualPath")}</Label>
                        <Input
                          value={renameVirtualPath}
                          onChange={(event) => setRenameVirtualPath(event.target.value)}
                          disabled={activeEntry.kind !== "file" || busy}
                          className="h-8 text-[11px]"
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8"
                        disabled={busy || activeEntry.kind !== "file"}
                        onClick={() => void applyRename()}
                      >
                        <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                        {t("memory.applyRename")}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
                  {t("memory.openToInspect")}
                </div>
              )}
            </div>
          </section>

          <section className="flex min-h-0 flex-col">
            <div className="shrink-0 border-b px-4 py-3">
              <div className="mb-2 flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">{t("memory.workbench")}</h3>
              </div>
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Checkbox
                  checked={completeOnly}
                  onCheckedChange={(checked) =>
                    startTransition(() => setCompleteOnly(checked === true))
                  }
                />
                {t("memory.completeOnly")}
              </label>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4 py-3">
              <div className="shrink-0 space-y-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t("memory.modelFolders", { count: groupedCandidates.length })}
                </div>
                {groupedCandidates.length === 0 ? (
                  <div className="rounded-lg border border-dashed px-3 py-4 text-[11px] text-muted-foreground">
                    {t("memory.noCandidates")}
                  </div>
                ) : (
                  <div ref={groupsViewportRef} className="max-h-[min(38vh,300px)] overflow-y-auto">
                    <div
                      style={{
                        height: `${groupedCandidateVirtualizer.getTotalSize()}px`,
                        position: "relative",
                        width: "100%",
                      }}
                    >
                      {groupedCandidateVirtualizer.getVirtualItems().map((virtualRow) => {
                        const group = groupedCandidates[virtualRow.index];
                        if (!group) {
                          return null;
                        }
                        const allChecked =
                          group.candidates.length > 0 &&
                          group.candidates.every((candidate) => selectedCandidateIds.has(candidate.id));
                        return (
                          <label
                            key={group.folderRelativePath}
                            className="absolute left-0 right-0 flex items-start gap-2 rounded-lg border bg-muted/15 px-3 py-2"
                            style={{
                              transform: `translateY(${virtualRow.start}px)`,
                            }}
                          >
                            <Checkbox
                              checked={allChecked}
                              onCheckedChange={(checked) =>
                                startTransition(() =>
                                  setSelectedCandidateIds((prev) =>
                                    toggleCandidateGroupSelection(
                                      prev,
                                      group.candidates,
                                      checked === true,
                                    ),
                                  ),
                                )
                              }
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium" data-i18n-ignore="">{group.folderRelativePath}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {t("memory.folderSummary", {
                                  count: group.candidates.length,
                                  complete: group.completeCount,
                                })}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
                <div className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t("memory.candidates", { count: filteredCandidates.length })}
                </div>
                <div ref={candidatesViewportRef} className="min-h-0 flex-1 overflow-y-auto">
                  <div
                    style={{
                      height: `${candidateVirtualizer.getTotalSize()}px`,
                      position: "relative",
                      width: "100%",
                    }}
                  >
                    {candidateVirtualizer.getVirtualItems().map((virtualRow) => {
                      const candidate = filteredCandidates[virtualRow.index];
                      if (!candidate) {
                        return null;
                      }
                      return (
                        <label
                          key={candidate.id}
                          className={cn(
                            "absolute left-0 right-0 flex items-start gap-2 rounded-lg border px-3 py-2",
                            activeCandidate?.id === candidate.id
                              ? "border-primary/45 bg-primary/8"
                              : "bg-background",
                          )}
                          style={{
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                        >
                          <Checkbox
                            checked={selectedCandidateIds.has(candidate.id)}
                            onCheckedChange={(checked) =>
                              startTransition(() =>
                                setSelectedCandidateIds((prev) => {
                                  const next = new Set(prev);
                                  if (checked === true) {
                                    next.add(candidate.id);
                                  } else {
                                    next.delete(candidate.id);
                                  }
                                  return next;
                                }),
                              )
                            }
                          />
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={() => setActiveEntryId(candidate.modlEntryId)}
                          >
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium" data-i18n-ignore="">{candidate.displayLabel}</span>
                              {!candidate.complete ? (
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                              ) : null}
                            </div>
                            <div className="truncate text-[10px] text-muted-foreground" data-i18n-ignore="">
                              {candidate.modlVirtualPath}
                            </div>
                            <div className="mt-1 text-[10px] text-muted-foreground" data-i18n-ignore="">
                              mesh {candidate.meshVirtualPath ? "ready" : "missing"} · matl{" "}
                              {candidate.matlVirtualPaths.length} · textures {candidate.nutexbVirtualPaths.length}
                            </div>
                          </button>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

      {(busy || isPending || workspaceProgress) && (
        <div className="border-t bg-muted/25 px-4 py-2 text-[10px] text-muted-foreground">
          {workspaceProgress
            ? t("memory.buildingBundles", {
                done: workspaceProgress.done,
                total: workspaceProgress.total,
                label: workspaceProgress.currentLabel ? ` · ${workspaceProgress.currentLabel}` : "",
              })
            : t("memory.working")}
        </div>
      )}
    </AppRndModalShell>
  );
}
