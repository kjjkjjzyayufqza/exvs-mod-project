import { useCallback, useId, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { buildFileUrl, splitPathSegments } from "@/lib/fhm2d_fileUrlUtils";

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
  const bulkSelectId = useId();
  const prefixInputId = useId();
  const [rows, setRows] = useState<QuickAddFileRow[]>([]);
  const [bulkFileType, setBulkFileType] = useState<string>(".bin");
  const [shareFileIndexAcrossFolders, setShareFileIndexAcrossFolders] = useState(false);
  const [fileUrlPrefix, setFileUrlPrefix] = useState("");
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  const canConfirm = rows.length > 0;

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
      title: "Select files to add",
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
  }, []);

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

  return (
    <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="grid max-h-[min(90vh,720px)] grid-rows-[auto_minmax(0,1fr)_auto_auto] gap-0 overflow-hidden p-0 sm:max-w-[640px]">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Quick Add files</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-6 py-4 [scrollbar-gutter:stable]">
          <div className="flex flex-wrap items-end gap-3">
            <Button type="button" variant="outline" size="sm" onClick={() => void pickFiles()}>
              <FolderOpen className="mr-2 h-4 w-4" />
              Select files
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
              Remove selected ({selectedPaths.size})
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor={bulkSelectId} className="text-xs text-muted-foreground">
                Apply type to all
              </Label>
              <Select value={bulkFileType} onValueChange={setBulkFileType}>
                <SelectTrigger id={bulkSelectId} className="h-8 w-[140px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FILE_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="secondary" size="sm" className="h-8 text-xs" onClick={applyBulkType}>
                Apply to all rows
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={prefixInputId} className="text-xs font-medium">
              SubFileData fileUrl prefix (optional)
            </Label>
            <Input
              id={prefixInputId}
              value={fileUrlPrefix}
              onChange={(e) => setFileUrlPrefix(e.target.value)}
              placeholder="e.g. .\extra\ or 0xPACK\"
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground leading-snug">
              When set, each entry uses <span className="font-mono">{".\\<prefix segments>\\<file name>"}</span> (this
              field + selected file name). Leave empty to use{" "}
              <span className="font-mono">{`.\\{baseDir}\\{fileIndex}{fileType}`}</span> only.
            </p>
          </div>

          <div className="min-h-0">
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No files selected. Use Select files to choose one or more files.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                    <tr className="border-b">
                      <th className="w-10 px-2 py-2">
                        <Checkbox
                          checked={allSelected ? true : someSelected ? "indeterminate" : false}
                          onCheckedChange={(v) => toggleSelectAll(v === true)}
                          aria-label="Select all rows"
                        />
                      </th>
                      <th className="px-3 py-2 font-medium">File name</th>
                      <th className="px-3 py-2 font-medium">File type</th>
                      <th className="w-16 px-3 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={`${row.path}:${index}`} className="border-b border-border/60 bg-background">
                        <td className="px-2 py-2 align-middle">
                          <Checkbox
                            checked={selectedPaths.has(row.path)}
                            onCheckedChange={(v) => toggleRowSelected(row.path, v === true)}
                            aria-label={`Select ${row.name}`}
                          />
                        </td>
                        <td className="max-w-0 px-3 py-2">
                          <span className="block truncate font-mono" title={row.path}>
                            {row.name}
                          </span>
                        </td>
                        <td className="max-w-[200px] px-3 py-2">
                          <Select value={row.fileType} onValueChange={(v) => setRowType(index, v)}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {FILE_TYPE_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2">
                          <Button type="button" variant="ghost" size="sm" className="h-8 text-[10px]" onClick={() => removeRow(index)}>
                            Remove
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        <div className="shrink-0 border-t border-border/60 bg-background px-6 py-3">
          <label className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
            <Checkbox
              checked={shareFileIndexAcrossFolders}
              onCheckedChange={(checked) => setShareFileIndexAcrossFolders(checked === true)}
            />
            <span className="space-y-0.5">
              <span className="block text-xs font-medium leading-tight">Share one SubFileData across selected folders</span>
              <span className="block text-[11px] leading-snug text-muted-foreground">
                Each selected file uses one shared fileIndex, and every selected folder references that same file.
              </span>
            </span>
          </label>
        </div>
        <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!canConfirm} onClick={handleConfirm}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
