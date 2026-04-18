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
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  DialogLastPathKey,
  getDialogDefaultPath,
  rememberDialogSelection,
} from "@/utils/dialogLastPath";
import {
  buildSsbhPreviewBundleFromMemory,
  createFhm2dMemorySession,
  defaultFhm2dMemoryFormat,
  disposeFhm2dMemorySession,
  listFhm2dMemoryPreviewCandidates,
  renameFhm2dMemoryEntry,
} from "./fhm2dMemoryPreviewService";
import type {
  Fhm2dMemorySessionSummary,
  Fhm2dPreviewCandidate,
} from "./fhm2dMemoryPreviewTypes";
import {
  flattenVirtualTree,
  groupPreviewCandidatesByFolder,
  indexVirtualTreeEntries,
  toggleCandidateGroupSelection,
} from "./fhm2dMemoryPreviewUtils";
import { useSsbhModelPreview } from "./SsbhModelPreviewContext";

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
  const p = useSsbhModelPreview();
  const session = p.memoryWorkspaceSession;
  const sourcePath = p.memoryWorkspaceSourcePath;
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(new Set());
  const [treeSearchText, setTreeSearchText] = useState("");
  const [modelRelatedOnly, setModelRelatedOnly] = useState(false);
  const [completeOnly, setCompleteOnly] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [renameVirtualPath, setRenameVirtualPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();
  const treeViewportRef = useRef<HTMLDivElement | null>(null);
  const candidatesViewportRef = useRef<HTMLDivElement | null>(null);
  const memoryModalWasOpenRef = useRef(false);

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
            setSelectedCandidateIds(new Set());
            setCollapsedFolderIds(new Set());
            toast.success("Memory workspace was restored from disk.");
          } catch (e2) {
            toast.error(String(e2));
          } finally {
            if (!cancelled) {
              setBusy(false);
            }
          }
          return;
        }
        toast.error("Could not reach the in-memory FHM2D workspace session.", {
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

  const openSourcePath = useCallback(
    async (path: string) => {
      setBusy(true);
      try {
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
        setSelectedCandidateIds(new Set());
        setCollapsedFolderIds(new Set());
        setRenameName("");
        setRenameVirtualPath("");
        if (created.namingWarning) {
          toast.error("Memory preview naming warning", {
            description: created.namingWarning,
          });
        } else {
          toast.success("FHM2D loaded into memory workspace");
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

  const visibleTreeRows = useMemo(
    () =>
      flattenVirtualTree(
        session?.virtualTree ?? [],
        collapsedFolderIds,
        treeSearchText,
        modelRelatedOnly,
      ),
    [session?.virtualTree, collapsedFolderIds, treeSearchText, modelRelatedOnly],
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

  const activeEntry = activeEntryId ? virtualEntriesById[activeEntryId] ?? null : null;
  const activeCandidate = useMemo(() => {
    if (!activeEntry) {
      return null;
    }
    return (
      filteredCandidates.find(
        (candidate) =>
          candidate.modlEntryId === activeEntry.id ||
          candidate.modlVirtualPath === activeEntry.virtualPath,
      ) ?? null
    );
  }, [activeEntry, filteredCandidates]);

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
      toast.success("Virtual rename applied", {
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
    const selected = filteredCandidates.filter((candidate) => selectedCandidateIds.has(candidate.id));
    if (selected.length === 0) {
      throw new Error("Select at least one .numdlb candidate.");
    }
    const settled = await Promise.allSettled(
      selected.map((candidate) =>
        buildSsbhPreviewBundleFromMemory({
          sessionId: session.sessionId,
          modlVirtualPath: candidate.modlVirtualPath,
        }),
      ),
    );
    const bundles = settled
      .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof buildSsbhPreviewBundleFromMemory>>> => result.status === "fulfilled")
      .map((result) => result.value);
    const failed = settled
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => String(result.reason));
    if (failed.length > 0) {
      toast.error("Some memory preview candidates failed", {
        description: failed.slice(0, 3).join("\n"),
      });
    }
    if (bundles.length === 0) {
      throw new Error("No selected memory candidate could be loaded into the preview.");
    }
    return bundles;
  }, [filteredCandidates, selectedCandidateIds, session]);

  const applySelectionToPreview = useCallback(
    async (mode: "replace" | "append") => {
      setBusy(true);
      try {
        const bundles = await buildSelectedBundles();
        if (mode === "replace") {
          p.loadMemoryPreviewBundles(bundles);
          toast.success("Memory preview applied to 3D view");
        } else {
          p.appendMemoryPreviewBundles(bundles);
          toast.success("Memory preview appended to 3D view");
        }
      } catch (e) {
        toast.error(String(e));
      } finally {
        setBusy(false);
      }
    },
    [buildSelectedBundles, p],
  );

  return (
    <Dialog
      open={p.memoryPreviewModalOpen}
      onOpenChange={(openState) => {
        if (!openState) {
          closeModal();
          return;
        }
        p.setMemoryPreviewModalOpen(openState);
      }}
    >
      <DialogContent className="h-[min(88vh,860px)] max-w-[min(100vw-32px,1460px)] gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b bg-muted/35 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <DialogTitle className="flex items-center gap-2 text-base">
                <FileArchive className="h-4.5 w-4.5 text-primary" />
                Memory Preview Workspace
              </DialogTitle>
              <DialogDescription className="max-w-3xl text-[11px] leading-relaxed">
                Load an FHM2D package into memory, inspect the virtual file tree, rename entries without touching disk,
                then apply selected .numdlb candidates to the 3D preview.
              </DialogDescription>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" size="sm" onClick={() => void openFhm2dFile()} disabled={busy}>
                <FileArchive className="mr-1.5 h-3.5 w-3.5" />
                Open FHM2D
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void reloadSession()}
                disabled={busy || !sourcePath}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Reload Session
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void reloadSession()}
                disabled={busy || !sourcePath}
              >
                <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                Auto Rename
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void applySelectionToPreview("replace")}
                disabled={busy || p.previewBusy || selectedCandidateIds.size === 0}
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                Apply Selected To 3D View
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void applySelectionToPreview("append")}
                disabled={busy || p.previewBusy || selectedCandidateIds.size === 0}
              >
                <Layers3 className="mr-1.5 h-3.5 w-3.5" />
                Append To 3D View
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => void disposeCurrentSession()}
                disabled={busy || !session}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Clear Session
              </Button>
            </div>
          </div>
          {session ? (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
              <span>Source: {session.sourceName}</span>
              <span>Format: {session.format ?? "auto"}</span>
              <span>Rename rev: {session.renameRevision}</span>
              <span>{session.previewCandidates.length} preview candidates</span>
              {session.namingWarning ? (
                <span className="text-amber-600 dark:text-amber-400">Naming warning present</span>
              ) : null}
            </div>
          ) : null}
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(300px,1.1fr)_minmax(360px,1fr)_minmax(360px,1.1fr)]">
          <section className="flex min-h-0 flex-col border-r">
            <div className="shrink-0 border-b px-4 py-3">
              <div className="mb-2 flex items-center gap-2">
                <FolderTree className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Virtual File Tree</h3>
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
                    placeholder="Search path, name, extension"
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
                  Model-related only
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
                          <span className={cn("truncate", isActive ? "font-medium" : "font-normal")}>
                            {node.name}
                          </span>
                          {node.hasReferenceIssue ? (
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                          ) : null}
                        </div>
                        <div className="truncate font-mono text-[9px] text-muted-foreground/95">
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
                <h3 className="text-sm font-semibold">Details & Rename</h3>
              </div>
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Inspect the selected virtual entry, review dependencies for .numdlb files, and rename files entirely in
                memory.
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {activeEntry ? (
                <div className="space-y-4 text-[11px]">
                  <div className="rounded-lg border bg-muted/15 p-3">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Selected entry</div>
                    <div className="mt-1 break-all text-sm font-medium">{activeEntry.virtualPath}</div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
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
                            .numdlb candidate
                          </div>
                          <div className="font-medium">{activeCandidate.displayLabel}</div>
                        </div>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px]",
                            activeCandidate.complete
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : "bg-amber-500/10 text-amber-700 dark:text-amber-300",
                          )}
                        >
                          {activeCandidate.complete ? "Loadable" : "Needs fixes"}
                        </span>
                      </div>
                      <div className="space-y-1 text-[10px] text-muted-foreground">
                        <div>Folder: {activeCandidate.folderRelativePath}</div>
                        <div>Mesh: {activeCandidate.meshVirtualPath ?? "Missing"}</div>
                        <div>Skeleton: {activeCandidate.skelVirtualPath ?? "Optional / missing"}</div>
                        <div>Materials: {activeCandidate.matlVirtualPaths.length}</div>
                        <div>Textures: {activeCandidate.nutexbVirtualPaths.length}</div>
                      </div>
                      {activeCandidate.issues.length > 0 ? (
                        <div className="mt-3 space-y-1">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Issues</div>
                          {activeCandidate.issues.map((issue) => (
                            <div
                              key={issue}
                              className="rounded-md bg-amber-500/8 px-2 py-1 text-[10px] text-amber-700 dark:text-amber-300"
                            >
                              {issue}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="rounded-lg border bg-background p-3">
                    <div className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">Rename in memory</div>
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">File name</Label>
                        <Input
                          value={renameName}
                          onChange={(event) => setRenameName(event.target.value)}
                          disabled={activeEntry.kind !== "file" || busy}
                          className="h-8 text-[11px]"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Virtual path</Label>
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
                        Apply Rename
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
                  Open an FHM2D file to inspect the memory workspace.
                </div>
              )}
            </div>
          </section>

          <section className="flex min-h-0 flex-col">
            <div className="shrink-0 border-b px-4 py-3">
              <div className="mb-2 flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Preview Workbench</h3>
              </div>
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Checkbox
                  checked={completeOnly}
                  onCheckedChange={(checked) =>
                    startTransition(() => setCompleteOnly(checked === true))
                  }
                />
                Show only loadable .numdlb candidates
              </label>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4 py-3">
              <div className="max-h-[min(38vh,300px)] shrink-0 space-y-2 overflow-y-auto">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Model folders ({groupedCandidates.length})
                </div>
                {groupedCandidates.length === 0 ? (
                  <div className="rounded-lg border border-dashed px-3 py-4 text-[11px] text-muted-foreground">
                    No preview candidates in the current memory session.
                  </div>
                ) : (
                  groupedCandidates.map((group) => {
                    const allChecked =
                      group.candidates.length > 0 &&
                      group.candidates.every((candidate) => selectedCandidateIds.has(candidate.id));
                    return (
                      <label
                        key={group.folderRelativePath}
                        className="flex items-start gap-2 rounded-lg border bg-muted/15 px-3 py-2"
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
                          <div className="truncate font-medium">{group.folderRelativePath}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {group.candidates.length} .numdlb · {group.completeCount} loadable
                          </div>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>

              <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
                <div className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                  .numdlb candidates ({filteredCandidates.length})
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
                              <span className="truncate font-medium">{candidate.displayLabel}</span>
                              {!candidate.complete ? (
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                              ) : null}
                            </div>
                            <div className="truncate text-[10px] text-muted-foreground">
                              {candidate.modlVirtualPath}
                            </div>
                            <div className="mt-1 text-[10px] text-muted-foreground">
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

        {(busy || isPending) && (
          <div className="border-t bg-muted/25 px-4 py-2 text-[10px] text-muted-foreground">
            Working in memory workspace…
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
