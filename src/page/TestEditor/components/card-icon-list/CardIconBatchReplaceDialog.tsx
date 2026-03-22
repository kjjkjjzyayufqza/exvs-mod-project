import { useCallback, useDeferredValue, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { DDS_FORMATS } from "@/lib/ddsFormats";
import { splitPathSegments } from "@/lib/fhm2d_fileUrlUtils";
import type { CardIconItem } from "./cardIconStructure";

type ReplacePixelSource = "nutexb" | "convertPng";

function resolveFullPath(folderPath: string, fileUrl: string): Promise<string> {
  const segments = splitPathSegments(fileUrl);
  if (segments.length === 0) return Promise.resolve("");
  return join(folderPath, ...segments);
}

interface CardIconBatchReplaceDialogProps {
  folderPath: string;
  convertDirPath: string;
  items: CardIconItem[];
  onApplied: () => Promise<void> | void;
  triggerLabel?: string;
  disabled?: boolean;
}

export function CardIconBatchReplaceDialog({
  folderPath,
  convertDirPath,
  items,
  onApplied,
  triggerLabel = "Replace Format",
  disabled = false,
}: CardIconBatchReplaceDialogProps) {
  const [openState, setOpenState] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [ddsFormat, setDdsFormat] = useState<string>("BC7RgbaUnormSrgb");
  const [pixelSource, setPixelSource] = useState<ReplacePixelSource>("nutexb");
  const [isReplacing, setIsReplacing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [replaceProgress, setReplaceProgress] = useState<{
    current: number;
    total: number;
    currentFileName: string;
  } | null>(null);

  const lastAnchorFilteredIndexRef = useRef<number | null>(null);

  const deferredSearchTerm = useDeferredValue(searchTerm);

  const itemsWithFileUrl = useMemo(
    () => items.filter((it) => it.fileUrl && (it.fileIndex !== null || it.name)),
    [items]
  );

  const filteredItems = useMemo(() => {
    const term = deferredSearchTerm.trim().toLowerCase();
    if (!term) return itemsWithFileUrl;
    return itemsWithFileUrl.filter((item) => {
      const name = item.name ?? "";
      return (
        name.toLowerCase().includes(term) ||
        item.itemIndex.toString().includes(term) ||
        (item.fileIndex !== null && item.fileIndex.toString().includes(term))
      );
    });
  }, [itemsWithFileUrl, deferredSearchTerm]);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredItems.map((it) => it.itemIndex)));
  }, [filteredItems]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const toggleItem = useCallback((itemIndex: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemIndex)) {
        next.delete(itemIndex);
      } else {
        next.add(itemIndex);
      }
      return next;
    });
  }, []);

  const selectFilteredIndexRange = useCallback(
    (start: number, end: number) => {
      const lo = Math.min(start, end);
      const hi = Math.max(start, end);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (let i = lo; i <= hi; i++) {
          const it = filteredItems[i];
          if (it) next.add(it.itemIndex);
        }
        return next;
      });
    },
    [filteredItems]
  );

  const handleListRowMouseDownCapture = useCallback(
    (e: React.MouseEvent, filteredIndex: number, itemIndex: number) => {
      if (isReplacing || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      if (e.shiftKey && lastAnchorFilteredIndexRef.current !== null) {
        selectFilteredIndexRange(lastAnchorFilteredIndexRef.current, filteredIndex);
        return;
      }

      toggleItem(itemIndex);
      lastAnchorFilteredIndexRef.current = filteredIndex;
    },
    [isReplacing, selectFilteredIndexRange, toggleItem]
  );

  const handleCheckboxCheckedChange = useCallback(
    (filteredIndex: number, itemIndex: number) => {
      if (isReplacing) return;
      toggleItem(itemIndex);
      lastAnchorFilteredIndexRef.current = filteredIndex;
    },
    [isReplacing, toggleItem]
  );

  const handleReplace = useCallback(async () => {
    if (selectedIds.size === 0) {
      toast.error("Please select at least one image");
      return;
    }
    if (!folderPath || !convertDirPath) {
      toast.error("Folder path or convert dir is missing");
      return;
    }

    const toProcess = itemsWithFileUrl.filter((it) => selectedIds.has(it.itemIndex));
    if (toProcess.length === 0) {
      toast.error("No valid items selected");
      return;
    }

    const pairs: [string, string][] = [];
    for (const it of toProcess) {
      const url = it.fileUrl ?? "";
      if (!url) continue;
      const nutexbPath = await resolveFullPath(folderPath, url);
      if (!nutexbPath) continue;
      pairs.push([nutexbPath, convertDirPath]);
    }

    if (pairs.length === 0) {
      toast.error("Failed to resolve nutexb paths");
      return;
    }

    try {
      setIsReplacing(true);
      setReplaceProgress({ current: 0, total: pairs.length, currentFileName: "" });

      let converted = 0;
      let failed = 0;

      for (let i = 0; i < pairs.length; i++) {
        const [nutexbPath] = pairs[i];
        const fileName = nutexbPath.split(/[/\\]/).pop() ?? nutexbPath;
        setReplaceProgress({
          current: i + 1,
          total: pairs.length,
          currentFileName: fileName,
        });

        const result = await invoke<{ converted: number; failed: number }>(
          "card_icon_batch_replace_with_dds_format",
          { items: [pairs[i]], ddsFormat, source: pixelSource }
        );
        converted += result.converted;
        failed += result.failed;
      }

      setReplaceProgress(null);
      toast.success(`Replaced ${converted} image(s) with ${ddsFormat}`);
      if (failed > 0) {
        toast.error(`Failed to replace ${failed} image(s)`);
      }
      setOpenState(false);
      setSelectedIds(new Set());
      await onApplied();
    } catch (error) {
      setReplaceProgress(null);
      console.error(error);
      const message = error instanceof Error ? error.message : "Failed to replace format";
      toast.error(message);
    } finally {
      setIsReplacing(false);
    }
  }, [convertDirPath, ddsFormat, folderPath, itemsWithFileUrl, onApplied, pixelSource, selectedIds]);

  const selectedCount = selectedIds.size;

  return (
    <Dialog open={openState} onOpenChange={setOpenState}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled || itemsWithFileUrl.length === 0}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Replace Format (DDS)</DialogTitle>
          <DialogDescription>
            Pick where pixel data comes from, then a DDS format. Output always writes the on-disk nutexb and refreshes
            the matching PNG under __convert.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <Label>Pixel source</Label>
              <p className="text-xs text-muted-foreground leading-snug">
                <span className="font-semibold text-foreground">Original nutexb</span>: decode the .nutexb file on disk.{" "}
                <span className="font-semibold text-foreground">__convert PNG</span>: use{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">__convert</code> preview (
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{"{name}.png"}</code>) — run export first if
                previews are missing.
              </p>
            </div>
            <Select
              value={pixelSource}
              onValueChange={(v) => setPixelSource(v as ReplacePixelSource)}
              disabled={isReplacing}
            >
              <SelectTrigger className="h-8 w-full sm:w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nutexb">Original nutexb</SelectItem>
                <SelectItem value="convertPng">__convert PNG</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-2">
            <Label>DDS Format</Label>
            <Select value={ddsFormat} onValueChange={setDdsFormat} disabled={isReplacing}>
              <SelectTrigger className="w-[220px] h-8">
                <SelectValue placeholder="Select format" />
              </SelectTrigger>
              <SelectContent>
                {DDS_FORMATS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Images ({itemsWithFileUrl.length} total)</Label>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={selectAll} disabled={isReplacing}>
                  Select All
                </Button>
                <Button size="sm" variant="ghost" onClick={deselectAll} disabled={isReplacing}>
                  Deselect All
                </Button>
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or index..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-8"
                disabled={isReplacing}
              />
            </div>

            {searchTerm.trim() && (
              <div className="text-xs text-muted-foreground">
                Showing {filteredItems.length} of {itemsWithFileUrl.length} icons
              </div>
            )}

            <p className="text-xs text-muted-foreground leading-snug">
              Click a row to toggle. Hold <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[10px] font-mono">Shift</kbd> and click another row to select all items in between in the current list.
            </p>

            <ScrollArea className="h-[240px] rounded-md border border-border p-2">
              <div className="space-y-1">
                {filteredItems.map((item, filteredIndex) => (
                  <div
                    key={item.itemIndex}
                    className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer select-none"
                    onMouseDownCapture={(e) =>
                      handleListRowMouseDownCapture(e, filteredIndex, item.itemIndex)
                    }
                  >
                    <Checkbox
                      id={`batch-replace-${item.itemIndex}`}
                      checked={selectedIds.has(item.itemIndex)}
                      onCheckedChange={() =>
                        handleCheckboxCheckedChange(filteredIndex, item.itemIndex)
                      }
                      disabled={isReplacing}
                    />
                    <span className="text-sm font-normal cursor-pointer truncate flex-1 min-w-0 text-foreground">
                      {item.name ?? `#${item.itemIndex}`}
                    </span>
                  </div>
                ))}
                {filteredItems.length === 0 && (
                  <div className="text-center text-muted-foreground py-6 text-sm">
                    {searchTerm.trim()
                      ? `No icons found matching "${searchTerm.trim()}"`
                      : "No images available"}
                  </div>
                )}
              </div>
            </ScrollArea>

            {replaceProgress && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Processing {replaceProgress.current} / {replaceProgress.total}
                  </span>
                  <span className="truncate max-w-[280px]" title={replaceProgress.currentFileName}>
                    {replaceProgress.currentFileName}
                  </span>
                </div>
                <Progress
                  value={(replaceProgress.current / replaceProgress.total) * 100}
                  className="h-2"
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setOpenState(false)} disabled={isReplacing}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleReplace()}
            disabled={selectedCount === 0 || isReplacing}
          >
            {isReplacing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Replacing...
              </>
            ) : (
              `Replace ${selectedCount} image(s)`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
