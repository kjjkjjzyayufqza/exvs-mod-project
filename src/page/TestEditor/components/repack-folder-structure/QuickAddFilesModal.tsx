import { useCallback, useId, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { buildFileUrl, splitPathSegments } from "@/lib/fhm2d_fileUrlUtils";

const QUICK_ADD_ROW_HEIGHT = 49;
const QUICK_ADD_MODAL_DIMENSIONS = {
  width: 720,
  height: 720,
  minWidth: 600,
  minHeight: 500,
};

const FILE_TYPE_OPTIONS = [
  { value: ".nushdb", label: ".nushdb" },
  { value: ".nutexb", label: ".nutexb" },
  { value: ".nusktb", label: ".nusktb" },
  { value: ".numatb", label: ".numatb" },
  { value: ".numshb", label: ".numshb" },
  { value: ".numdlb", label: ".numdlb" },
  { value: ".nuhlpb", label: ".nuhlpb" },
  { value: ".nus3bank", label: ".nus3bank" },
  { value: ".nudnbb", label: ".nudnbb" },
  { value: ".nufxlb", label: ".nufxlb" },
  { value: ".nurpdb", label: ".nurpdb" },
  { value: ".bin", label: ".bin" },
] as const;

export type QuickAddFileRow = {
  path: string;
  name: string;
  fileType: string;
};

type QuickAddFilesModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: {
    rows: QuickAddFileRow[];
    shareFileIndexAcrossFolders: boolean;
    fileUrlPrefix: string;
  }) => void;
};

function fileBasename(filePath: string): string {
  const seg = filePath.replace(/\\/g, "/").split("/").filter((x) => x.length > 0).pop();
  return seg ?? filePath;
}

function inferFileTypeFromName(fileName: string): string {
  const lower = fileName.toLowerCase();
  for (const opt of FILE_TYPE_OPTIONS) {
    if (lower.endsWith(opt.value)) return opt.value;
  }
  return ".bin";
}

/**
 * Builds SubFileData `fileUrl` for Quick Add.
 * - If `prefix` is empty: `.\\{baseDir}\\{fileIndex}{fileType}` (project-relative slot path).
 * - If `prefix` is set: `.\\{prefixSegments}\\{sourceFileName}` (same shape as extract `build_file_url`).
 */
export function buildQuickAddSubFileUrl(
  baseDir: string,
  fileIndex: number,
  fileType: string,
  prefix: string,
  sourceFileName: string,
): string {
  const p = prefix.trim().replace(/\//g, "\\").replace(/\\+/g, "\\");
  if (!p) {
    const tail = `${baseDir}\\${fileIndex}${fileType}`;
    return `.\\${tail}`;
  }
  const segments = splitPathSegments(p);
  return buildFileUrl(segments, sourceFileName, "\\");
}

export function QuickAddFilesModal({ open: dialogOpen, onOpenChange, onConfirm }: QuickAddFilesModalProps) {
  const { t } = useTranslation("test-workspace");
  const bulkSelectId = useId();
  const prefixInputId = useId();
  const [rows, setRows] = useState<QuickAddFileRow[]>([]);
  const [bulkFileType, setBulkFileType] = useState<string>(".bin");
  const [shareFileIndexAcrossFolders, setShareFileIndexAcrossFolders] = useState(false);
  const [fileUrlPrefix, setFileUrlPrefix] = useState("");
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const rowsViewportRef = useRef<HTMLDivElement | null>(null);

  const canConfirm = rows.length > 0;
  const getRowsViewport = useCallback(() => rowsViewportRef.current, []);
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: getRowsViewport,
    estimateSize: () => QUICK_ADD_ROW_HEIGHT,
    overscan: 10,
  });

  const resetWhenClosed = useCallback(() => {
    setRows([]);
    setBulkFileType(".bin");
    setShareFileIndexAcrossFolders(false);
    setFileUrlPrefix("");
    setSelectedPaths(new Set());
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        resetWhenClosed();
      }
      onOpenChange(next);
    },
    [onOpenChange, resetWhenClosed],
  );

  const pickFiles = useCallback(async () => {
    const selected = await open({
      multiple: true,
      directory: false,
      title: t("quickAdd.selectFilesTitle"),
    });
    if (selected === null) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    const normalized = paths.filter((p): p is string => typeof p === "string" && p.trim().length > 0);
    if (normalized.length === 0) return;
    setRows((prev) => {
      const seen = new Set(prev.map((r) => r.path.replace(/\\/g, "/").toLowerCase()));
      const next: QuickAddFileRow[] = [...prev];
      for (const p of normalized) {
        const key = p.replace(/\\/g, "/").toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const name = fileBasename(p);
        next.push({ path: p, name, fileType: inferFileTypeFromName(name) });
      }
      return next;
    });
  }, [t]);

  const applyBulkType = useCallback(() => {
    setRows((prev) => prev.map((r) => ({ ...r, fileType: bulkFileType })));
  }, [bulkFileType]);

  const setRowType = useCallback((index: number, fileType: string) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, fileType } : r)));
  }, []);

  const removeRow = useCallback((index: number) => {
    setRows((prev) => {
      const row = prev[index];
      const next = prev.filter((_, i) => i !== index);
      if (row) {
        setSelectedPaths((s) => {
          const n = new Set(s);
          n.delete(row.path);
          return n;
        });
      }
      return next;
    });
  }, []);

  const removeSelectedRows = useCallback(() => {
    if (selectedPaths.size === 0) return;
    setRows((prev) => prev.filter((r) => !selectedPaths.has(r.path)));
    setSelectedPaths(new Set());
  }, [selectedPaths]);

  const toggleRowSelected = useCallback((path: string, checked: boolean) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(path);
      } else {
        next.delete(path);
      }
      return next;
    });
  }, []);

  const { allSelected, someSelected } = useMemo(() => {
    if (rows.length === 0) {
      return { allSelected: false, someSelected: false };
    }
    let count = 0;
    for (const r of rows) {
      if (selectedPaths.has(r.path)) count += 1;
    }
    return {
      allSelected: count === rows.length,
      someSelected: count > 0 && count < rows.length,
    };
  }, [rows, selectedPaths]);

  const toggleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedPaths(new Set(rows.map((r) => r.path)));
      } else {
        setSelectedPaths(new Set());
      }
    },
    [rows],
  );

  const handleConfirm = useCallback(() => {
    if (rows.length === 0) return;
    onConfirm({ rows, shareFileIndexAcrossFolders, fileUrlPrefix });
    resetWhenClosed();
    onOpenChange(false);
  }, [onConfirm, onOpenChange, resetWhenClosed, rows, shareFileIndexAcrossFolders, fileUrlPrefix]);

  if (!dialogOpen) return null;

  return (
    <AppRndModalShell
      titleId="quick-add-files-title"
      title={t("quickAdd.title")}
      subtitle={t("quickAdd.subtitle", { count: rows.length })}
      headerIcon={<FolderOpen className="h-5 w-5 text-primary" />}
      dimensions={QUICK_ADD_MODAL_DIMENSIONS}
      storageKey="app.rnd-size.quick-add-files"
      onClose={() => handleOpenChange(false)}
      footer={
        <div className="bg-background">
          <div className="px-6 py-3">
            <label className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
              <Checkbox
                checked={shareFileIndexAcrossFolders}
                onCheckedChange={(checked) => setShareFileIndexAcrossFolders(checked === true)}
              />
              <span className="space-y-0.5">
                <span className="block text-xs font-medium leading-tight">{t("quickAdd.shareTitle")}</span>
                <span className="block text-[11px] leading-snug text-muted-foreground">
                  {t("quickAdd.shareHelp")}
                </span>
              </span>
            </label>
          </div>
          <div className="flex justify-end gap-2 border-t px-6 py-4">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              {t("quickAdd.cancel")}
            </Button>
            <Button type="button" disabled={!canConfirm} onClick={handleConfirm}>
              {t("quickAdd.confirm")}
            </Button>
          </div>
        </div>
      }
    >
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4 [scrollbar-gutter:stable]">
          <div className="flex flex-wrap items-end gap-3">
            <Button type="button" variant="outline" size="sm" onClick={() => void pickFiles()}>
              <FolderOpen className="mr-2 h-4 w-4" />
              {t("quickAdd.selectFiles")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="gap-1"
              disabled={selectedPaths.size === 0}
              onClick={removeSelectedRows}
            >
              <Trash2 className="h-4 w-4" />
              {t("quickAdd.removeSelected", { count: selectedPaths.size })}
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor={bulkSelectId} className="text-xs text-muted-foreground">
                {t("quickAdd.applyTypeToAll")}
              </Label>
              <Select value={bulkFileType} onValueChange={setBulkFileType}>
                <SelectTrigger id={bulkSelectId} className="h-8 w-[140px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FILE_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      <span data-i18n-ignore="">{opt.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="secondary" size="sm" className="h-8 text-xs" onClick={applyBulkType}>
                {t("quickAdd.applyToAllRows")}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={prefixInputId} className="text-xs font-medium">
              {t("quickAdd.fileUrlPrefix")}
            </Label>
            <Input
              id={prefixInputId}
              value={fileUrlPrefix}
              onChange={(e) => setFileUrlPrefix(e.target.value)}
              placeholder={t("quickAdd.prefixPlaceholder")}
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground leading-snug">
              {t("quickAdd.prefixHelp", {
                namedPattern: ".\\<prefix segments>\\<file name>",
                slotPattern: `.\\{baseDir}\\{fileIndex}{fileType}`,
              })}
            </p>
          </div>

          <div className="min-h-0">
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("quickAdd.empty")}</p>
            ) : (
              <div className="overflow-hidden rounded-md border text-left text-xs">
                <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_12rem_5rem] border-b bg-muted/80 backdrop-blur">
                  <div className="px-2 py-2">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? "indeterminate" : false}
                      onCheckedChange={(v) => toggleSelectAll(v === true)}
                      aria-label={t("quickAdd.selectAll")}
                    />
                  </div>
                  <div className="px-3 py-2 font-medium">{t("quickAdd.fileName")}</div>
                  <div className="px-3 py-2 font-medium">{t("quickAdd.fileType")}</div>
                  <div className="px-3 py-2 font-medium" />
                </div>
                <div ref={rowsViewportRef} className="max-h-[min(42vh,360px)] overflow-auto">
                  <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                      const row = rows[virtualRow.index];
                      if (!row) return null;
                      const index = virtualRow.index;
                      return (
                        <div
                          key={`${row.path}:${index}`}
                          className="absolute left-0 top-0 grid w-full grid-cols-[2.5rem_minmax(0,1fr)_12rem_5rem] items-center border-b border-border/60 bg-background"
                          style={{
                            height: virtualRow.size,
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                        >
                          <div className="px-2 py-2">
                            <Checkbox
                              checked={selectedPaths.has(row.path)}
                              onCheckedChange={(v) => toggleRowSelected(row.path, v === true)}
                              aria-label={t("quickAdd.selectRow", { name: row.name })}
                            />
                          </div>
                          <div className="min-w-0 px-3 py-2">
                            <span className="block truncate font-mono" title={row.path} data-i18n-ignore="">
                              {row.name}
                            </span>
                          </div>
                          <div className="px-3 py-2">
                            <Select value={row.fileType} onValueChange={(v) => setRowType(index, v)}>
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {FILE_TYPE_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                    <span data-i18n-ignore="">{opt.label}</span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="px-3 py-2">
                            <Button type="button" variant="ghost" size="sm" className="h-8 text-[10px]" onClick={() => removeRow(index)}>
                              {t("quickAdd.remove")}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
    </AppRndModalShell>
  );
}
