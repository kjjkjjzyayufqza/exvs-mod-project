import { useCallback, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

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
import { Label } from "@/components/ui/label";
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
  const [isReplacing, setIsReplacing] = useState(false);

  const itemsWithFileUrl = useMemo(
    () => items.filter((it) => it.fileUrl && (it.fileIndex !== null || it.name)),
    [items]
  );

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(itemsWithFileUrl.map((it) => it.itemIndex)));
  }, [itemsWithFileUrl]);

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
      const result = await invoke<{ converted: number; failed: number }>(
        "card_icon_batch_replace_with_dds_format",
        { items: pairs, ddsFormat }
      );
      toast.success(`Replaced ${result.converted} image(s) with ${ddsFormat}`);
      if (result.failed > 0) {
        toast.error(`Failed to replace ${result.failed} image(s)`);
      }
      setOpenState(false);
      setSelectedIds(new Set());
      await onApplied();
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Failed to replace format";
      toast.error(message);
    } finally {
      setIsReplacing(false);
    }
  }, [convertDirPath, ddsFormat, folderPath, itemsWithFileUrl, onApplied, selectedIds]);

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
            Select images and choose a DDS format. Selected nutexb files will be re-encoded with the new format and
            __convert previews refreshed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
            <ScrollArea className="h-[280px] rounded-md border border-border p-2">
              <div className="space-y-1">
                {itemsWithFileUrl.map((item) => (
                  <div
                    key={item.itemIndex}
                    className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50"
                  >
                    <Checkbox
                      id={`batch-replace-${item.itemIndex}`}
                      checked={selectedIds.has(item.itemIndex)}
                      onCheckedChange={() => toggleItem(item.itemIndex)}
                      disabled={isReplacing}
                    />
                    <Label
                      htmlFor={`batch-replace-${item.itemIndex}`}
                      className="text-sm font-normal cursor-pointer truncate flex-1 min-w-0"
                    >
                      {item.name ?? `#${item.itemIndex}`}
                    </Label>
                  </div>
                ))}
              </div>
            </ScrollArea>
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
