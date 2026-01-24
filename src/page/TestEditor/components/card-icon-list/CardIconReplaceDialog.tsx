import { useCallback, useMemo, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FilePathInput } from "@/components/ui/filePathInput";
import { Label } from "@/components/ui/label";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { buildCardIconPreviewPath } from "./cardIconUtils";
import { splitPathSegments } from "@/lib/fhm2d_fileUrlUtils";
import type { CardIconItem } from "./cardIconStructure";

type ReplaceSummary = {
  outputNutexbPath: string;
  previewPngPath: string;
  nutexbName: string;
};

interface CardIconReplaceDialogProps {
  folderPath: string;
  convertDirPath: string;
  selectedItem: CardIconItem | null;
  onApplied: () => Promise<void> | void;
  triggerLabel?: string;
}

function resolveFullPath(folderPath: string, fileUrl: string): Promise<string> {
  const segments = splitPathSegments(fileUrl);
  if (segments.length === 0) return Promise.resolve("");
  return join(folderPath, ...segments);
}

export function CardIconReplaceDialog({
  folderPath,
  convertDirPath,
  selectedItem,
  onApplied,
  triggerLabel = "Edit Image",
}: CardIconReplaceDialogProps) {
  const [openState, setOpenState] = useState(false);
  const [pngPath, setPngPath] = useState("");
  const [isReplacing, setIsReplacing] = useState(false);

  const targetFileUrl = selectedItem?.fileUrl ?? "";
  const canEdit = Boolean(folderPath && convertDirPath && targetFileUrl);

  const previewSrc = useMemo(() => {
    if (pngPath) return convertFileSrc(pngPath);
    if (!selectedItem?.name) return null;
    const previewPath = buildCardIconPreviewPath(convertDirPath, selectedItem.name);
    return previewPath ? convertFileSrc(previewPath) : null;
  }, [convertDirPath, pngPath, selectedItem?.name]);

  const handlePngPicked = useCallback((picked: string | string[]) => {
    if (Array.isArray(picked)) {
      setPngPath(picked[0] ?? "");
      return;
    }
    setPngPath(picked);
  }, []);

  const handleApply = useCallback(async () => {
    if (!selectedItem) {
      toast.error("Select an item to replace");
      return;
    }
    if (!folderPath) {
      toast.error("Folder path is empty");
      return;
    }
    if (!convertDirPath) {
      toast.error("Convert folder is not available");
      return;
    }
    if (!targetFileUrl) {
      toast.error("Target nutexb path is not available");
      return;
    }
    if (!pngPath) {
      toast.error("Please select a PNG file");
      return;
    }

    try {
      setIsReplacing(true);
      const nutexbPath = await resolveFullPath(folderPath, targetFileUrl);
      if (!nutexbPath) {
        toast.error("Failed to resolve nutexb path");
        return;
      }
      const result = await invoke<ReplaceSummary>("card_icon_replace_from_png", {
        nutexbPath,
        convertDir: convertDirPath,
        pngPath,
      });
      toast.success(`Updated card icon: ${result.nutexbName}`);
      setOpenState(false);
      setPngPath("");
      await onApplied();
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Failed to replace card icon";
      toast.error(message);
    } finally {
      setIsReplacing(false);
    }
  }, [convertDirPath, folderPath, onApplied, pngPath, selectedItem, targetFileUrl]);

  return (
    <Dialog open={openState} onOpenChange={setOpenState}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={!canEdit}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[840px]">
        <DialogHeader>
          <DialogTitle>Replace Card Icon</DialogTitle>
          <DialogDescription>
            Replaces the selected nutexb and refreshes the preview PNG under <span className="font-mono">__convert</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <Label>Preview</Label>
            <Card className="overflow-hidden min-h-[360px]">
              <AspectRatio ratio={1} className="bg-black flex items-center justify-center">
                {previewSrc ? (
                  <img
                    src={previewSrc}
                    alt="Card icon preview"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full w-full bg-black">
                    <span className="text-sm text-muted-foreground">No preview available</span>
                  </div>
                )}
              </AspectRatio>
            </Card>
            <div className="text-xs text-muted-foreground min-h-8 leading-snug">
              {pngPath ? "Previewing the selected PNG (will be applied)." : "Previewing current __convert PNG (if exists)."}
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Target Nutexb</Label>
              <div className="text-xs text-muted-foreground break-all border rounded-md px-3 py-2 min-h-10">
                {targetFileUrl || "No target selected"}
              </div>
              <div className="text-xs text-muted-foreground min-h-8 leading-snug">
                The target is resolved from <span className="font-mono">SubFileData.fileUrl</span>.
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="card-icon-replace-png">Source PNG</Label>
              <FilePathInput
                id="card-icon-replace-png"
                value={pngPath}
                placeholder="Select a PNG file..."
                picker={{
                  kind: "file",
                  multiple: false,
                  title: "Select PNG file",
                  filters: [{ name: "PNG", extensions: ["png"] }],
                }}
                onPickedValue={handlePngPicked}
                disabled={isReplacing}
              />
              <div className="text-xs text-muted-foreground min-h-8 leading-snug">
                The PNG will be converted in Rust (no external executables).
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpenState(false)} disabled={isReplacing}>
                Cancel
              </Button>
              <Button onClick={() => void handleApply()} disabled={!pngPath || isReplacing || !canEdit}>
                {isReplacing ? "Replacing..." : "Apply"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
