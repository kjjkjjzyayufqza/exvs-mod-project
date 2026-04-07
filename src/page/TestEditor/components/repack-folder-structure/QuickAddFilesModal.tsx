import { useCallback, useId, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

export function QuickAddFilesModal({ open: dialogOpen, onOpenChange, onConfirm }: QuickAddFilesModalProps) {
  const bulkSelectId = useId();
  const [rows, setRows] = useState<QuickAddFileRow[]>([]);
  const [bulkFileType, setBulkFileType] = useState<string>(".bin");
  const [shareFileIndexAcrossFolders, setShareFileIndexAcrossFolders] = useState(false);

  const canConfirm = rows.length > 0;

  const resetWhenClosed = useCallback(() => {
    setRows([]);
    setBulkFileType(".bin");
    setShareFileIndexAcrossFolders(false);
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
    setRows((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleConfirm = useCallback(() => {
    if (rows.length === 0) return;
    onConfirm({ rows, shareFileIndexAcrossFolders });
    resetWhenClosed();
    onOpenChange(false);
  }, [onConfirm, onOpenChange, resetWhenClosed, rows, shareFileIndexAcrossFolders]);

  return (
    <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[min(90vh,720px)] gap-0 overflow-hidden p-0 sm:max-w-[640px]">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Quick Add files</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-col gap-4 px-6 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <Button type="button" variant="outline" size="sm" onClick={() => void pickFiles()}>
              <FolderOpen className="mr-2 h-4 w-4" />
              Select files
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

          <div className="min-h-0 flex-1">
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No files selected. Use Select files to choose one or more files.</p>
            ) : (
              <ScrollArea className="h-[min(360px,45vh)] rounded-md border">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                    <tr className="border-b">
                      <th className="px-3 py-2 font-medium">File name</th>
                      <th className="px-3 py-2 font-medium">File type</th>
                      <th className="w-16 px-3 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={`${row.path}:${index}`} className="border-b border-border/60 bg-background">
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
              </ScrollArea>
            )}
          </div>
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
        <DialogFooter className="shrink-0 border-t px-6 py-4">
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
