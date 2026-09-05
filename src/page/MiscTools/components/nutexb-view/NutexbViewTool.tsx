import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  ImageIcon,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  DialogLastPathKey,
  getDialogDefaultPath,
  rememberDialogSelection,
} from "@/utils/dialogLastPath";
import { formatByteSize } from "../fhm2d-image-view/fhm2dImageViewModel";
import { DiskNutexbImage } from "./DiskNutexbImage";
import {
  buildNutexbTree,
  collectNutexbFolderIds,
  findNutexbTreeNode,
  flattenNutexbTree,
  visibleNutexbFiles,
  type NutexbFolderScan,
  type NutexbTreeNode,
} from "./nutexbViewModel";

const MODAL_DIMENSIONS = {
  width: 1320,
  height: 840,
  minWidth: 920,
  minHeight: 560,
};

const THUMB_COLUMNS = 3;
const THUMB_ROW_HEIGHT = 168;
const TREE_ROW_HEIGHT = 28;

type NutexbInfoDto = {
  name: string;
  width: number;
  height: number;
  depth: number;
  imageFormat: string;
  mipmapCount: number;
  layerCount: number;
  dataSize: number;
  isSwizzled: boolean;
};

function rootFolderName(rootPath: string): string {
  const parts = rootPath.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] || "nutexb";
}

export function NutexbViewTool() {
  const { t } = useTranslation("misc-tools-b");
  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scan, setScan] = useState<NutexbFolderScan | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [info, setInfo] = useState<NutexbInfoDto | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const treeRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);

  const deferredSearch = useDeferredValue(search);
  const tree = useMemo(
    () => (scan ? buildNutexbTree(rootFolderName(scan.root), scan.files) : null),
    [scan],
  );
  const rows = useMemo(
    () => (tree ? flattenNutexbTree(tree, collapsedFolderIds, deferredSearch) : []),
    [collapsedFolderIds, deferredSearch, tree],
  );
  const selectedNode = useMemo(
    () => (tree && selectedId != null ? findNutexbTreeNode(tree, selectedId) : null),
    [selectedId, tree],
  );
  const selectedFiles = useMemo(() => {
    if (!tree) return [];
    return visibleNutexbFiles(tree, selectedId, deferredSearch);
  }, [deferredSearch, selectedId, tree]);
  const selectedFile =
    selectedNode?.kind === "file" ? selectedNode : selectedFiles[0] ?? null;
  const thumbFiles = selectedFiles;
  const thumbRowCount = Math.ceil(thumbFiles.length / THUMB_COLUMNS);

  const treeVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => treeRef.current,
    estimateSize: () => TREE_ROW_HEIGHT,
    overscan: 12,
  });
  const thumbVirtualizer = useVirtualizer({
    count: thumbRowCount,
    getScrollElement: () => thumbRef.current,
    estimateSize: () => THUMB_ROW_HEIGHT,
    overscan: 2,
  });

  const loadFolder = useCallback(async (folderPath: string) => {
    setBusy(true);
    setInfo(null);
    setInfoError(null);
    try {
      const next = await invoke<NutexbFolderScan>("list_nutexb_folder", { root: folderPath });
      setScan(next);
      setSelectedId("");
      setCollapsedFolderIds(new Set());
      setSearch("");
      rememberDialogSelection(DialogLastPathKey.miscNutexbView, folderPath, "directory");
      toast.success(t("nutexb.found", { count: next.files.length }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [t]);

  const pickFolder = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: getDialogDefaultPath(DialogLastPathKey.miscNutexbView) ?? undefined,
      });
      const path = Array.isArray(selected) ? selected[0] : selected;
      if (!path) return;
      await loadFolder(path);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, [loadFolder]);

  const selectNode = useCallback((node: NutexbTreeNode) => {
    setSelectedId(node.id);
  }, []);

  useEffect(() => {
    if (!selectedFile?.path) {
      setInfo(null);
      setInfoError(null);
      return;
    }
    const path = selectedFile.path;
    let cancelled = false;
    void invoke<NutexbInfoDto>("nutexb_read_info", { inputPath: path })
      .then((nextInfo) => {
        if (!cancelled) {
          setInfo(nextInfo);
          setInfoError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setInfo(null);
          setInfoError(error instanceof Error ? error.message : String(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedFile?.path]);

  const toggleFolder = useCallback((id: string) => {
    setCollapsedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setCollapsedFolderIds(new Set());
  }, []);

  const collapseAll = useCallback(() => {
    if (!tree) return;
    setCollapsedFolderIds(new Set(collectNutexbFolderIds(tree)));
  }, [tree]);

  return (
    <>
      <Button variant="outline" className="w-full" onClick={() => setIsOpen(true)}>
        {t("nutexb.open")}
      </Button>
      {isOpen ? (
        <AppRndModalShell
          titleId="misc-tools-nutexb-view-title"
          title={t("nutexb.title")}
          subtitle={t("nutexb.subtitle")}
          headerIcon={<ImageIcon className="h-5 w-5" />}
          dimensions={MODAL_DIMENSIONS}
          storageKey="misc-tools-nutexb-view-size"
          closeDisabled={busy}
          onClose={() => setIsOpen(false)}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => void pickFolder()} disabled={busy}>
                {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FolderOpen className="mr-1.5 h-4 w-4" />}
                {t("common.openFolder")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !scan}
                onClick={() => scan && void loadFolder(scan.root)}
              >
                <RefreshCw className="mr-1.5 h-4 w-4" />
                {t("common.refresh")}
              </Button>
              {scan ? (
                <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={scan.root}>
                  {scan.root}
                </div>
              ) : null}
            </div>

            {!scan ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                <ImageIcon className="h-10 w-10 opacity-50" />
                <div>{t("nutexb.empty")}</div>
                <Button onClick={() => void pickFolder()} disabled={busy}>
                  {t("common.openFolder")}
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t("nutexb.filterPlaceholder")}
                    className="h-8 pl-9"
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("nutexb.fileCount", { count: scan.files.length })}
                  {selectedNode ? ` · ${t("nutexb.filesShown", { count: selectedFiles.length })}` : ""}
                </div>
                <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)_300px] gap-3">
                  <div className="flex min-h-0 flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium">{t("common.tree")}</div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={expandAll}>
                          {t("common.expandAll")}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={collapseAll}>
                          {t("common.collapseAll")}
                        </Button>
                      </div>
                    </div>
                    <div ref={treeRef} className="min-h-0 flex-1 overflow-auto rounded-md border">
                      <div
                        style={{
                          height: `${treeVirtualizer.getTotalSize()}px`,
                          position: "relative",
                          width: "100%",
                        }}
                      >
                        {treeVirtualizer.getVirtualItems().map((row) => {
                          const item = rows[row.index];
                          if (!item) return null;
                          const { node, depth } = item;
                          const active = selectedId === node.id;
                          const collapsed = collapsedFolderIds.has(node.id);
                          return (
                            <div
                              key={row.key}
                              className={cn(
                                "absolute left-0 flex w-full items-center gap-1 pr-2 text-xs",
                                active && "bg-accent",
                              )}
                              style={{
                                height: `${row.size}px`,
                                transform: `translateY(${row.start}px)`,
                                paddingLeft: `${8 + depth * 14}px`,
                              }}
                            >
                              {node.kind === "folder" ? (
                                <button
                                  type="button"
                                  className="shrink-0"
                                  onClick={() => toggleFolder(node.id)}
                                  aria-label={collapsed ? t("nutexb.expandFolder") : t("nutexb.collapseFolder")}
                                >
                                  {collapsed ? (
                                    <ChevronRight className="h-3.5 w-3.5" />
                                  ) : (
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              ) : (
                                <span className="w-3.5 shrink-0" />
                              )}
                              <button
                                type="button"
                                className="flex min-w-0 flex-1 items-center gap-1 text-left"
                                onClick={() => selectNode(node)}
                                title={node.relativePath}
                              >
                                {node.kind === "folder" ? (
                                  <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                ) : (
                                  <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                )}
                                <span className="truncate">{node.name}</span>
                                {node.kind === "folder" ? (
                                  <span className="shrink-0 text-[10px] text-muted-foreground">
                                    {node.fileCount}
                                  </span>
                                ) : null}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      {rows.length === 0 ? (
                        <div className="p-4 text-center text-xs text-muted-foreground">{t("nutexb.noMatches")}</div>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex min-h-0 flex-col gap-2">
                    <div className="text-sm font-medium">{t("common.images")}</div>
                    <div ref={thumbRef} className="min-h-0 flex-1 overflow-auto rounded-md border">
                      <div
                        style={{
                          height: `${thumbVirtualizer.getTotalSize()}px`,
                          position: "relative",
                          width: "100%",
                        }}
                      >
                        {thumbVirtualizer.getVirtualItems().map((row) => {
                          const start = row.index * THUMB_COLUMNS;
                          const rowFiles = thumbFiles.slice(start, start + THUMB_COLUMNS);
                          return (
                            <div
                              key={row.key}
                              className="absolute left-0 grid w-full grid-cols-3 gap-2 p-2"
                              style={{
                                height: `${row.size}px`,
                                transform: `translateY(${row.start}px)`,
                              }}
                            >
                              {rowFiles.map((file) => {
                                if (!file.path) return null;
                                const active = selectedFile?.id === file.id;
                                return (
                                  <button
                                    key={file.id}
                                    type="button"
                                    className={cn(
                                      "flex flex-col overflow-hidden rounded-md border bg-background text-left",
                                      active && "ring-2 ring-primary",
                                    )}
                                    onClick={() => selectNode(file)}
                                  >
                                    <div className="h-[112px] w-full">
                                      <DiskNutexbImage path={file.path} mode="thumb" />
                                    </div>
                                    <div className="truncate px-1.5 py-1 text-[10px]" title={file.relativePath}>
                                      {file.name}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                      {thumbFiles.length === 0 ? (
                        <div className="p-6 text-center text-sm text-muted-foreground">
                          {t("nutexb.noFiles")}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex min-h-0 flex-col gap-2">
                    <div className="text-sm font-medium">{t("common.preview")}</div>
                    <div className="h-[280px] overflow-hidden rounded-md border">
                      {selectedFile?.path ? (
                        <DiskNutexbImage path={selectedFile.path} mode="full" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                          {t("nutexb.selectFile")}
                        </div>
                      )}
                    </div>
                    <div className="space-y-0.5 break-all text-[11px] text-muted-foreground">
                      {selectedFile ? (
                        <div data-i18n-ignore="">
                          <div>{selectedFile.name}</div>
                          <div>{selectedFile.relativePath}</div>
                          <div>{selectedFile.path}</div>
                          <div>{formatByteSize(selectedFile.size)}</div>
                        </div>
                      ) : null}
                      {info ? (
                        <>
                          <div>
                            {t("nutexb.name")}: <span data-i18n-ignore="">{info.name}</span>
                          </div>
                          <div data-i18n-ignore="">
                            {t("nutexb.dimensions", {
                              width: info.width,
                              height: info.height,
                              depth: info.depth,
                            })}
                          </div>
                          <div>
                            {t("nutexb.format")}: <span data-i18n-ignore="">{info.imageFormat}</span>
                          </div>
                          <div>
                            {t("nutexb.mipsLayers", {
                              mips: info.mipmapCount,
                              layersLabel: t("nutexb.layers"),
                              layers: info.layerCount,
                            })}
                            {info.isSwizzled ? ` · ${t("nutexb.swizzled")}` : ""}
                          </div>
                        </>
                      ) : null}
                      {infoError ? <div className="text-destructive" data-i18n-ignore="">{infoError}</div> : null}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </AppRndModalShell>
      ) : null}
    </>
  );
}
