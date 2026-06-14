import { useCallback, useEffect, useMemo, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { exists } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";
import { ImageIcon } from "lucide-react";

import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilePathInput } from "@/components/ui/filePathInput";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DDS_FORMATS } from "@/lib/ddsFormats";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { buildCardIconPreviewPath } from "./cardIconUtils";
import { splitPathSegments } from "@/lib/fhm2d_fileUrlUtils";
import type { CardIconItem } from "./cardIconStructure";

type ReplaceSummary = {
  outputNutexbPath: string;
  previewPngPath: string;
  nutexbName: string;
};

const CARD_ICON_REPLACE_MODAL_DIMENSIONS = {
  width: 860,
  height: 680,
  minWidth: 700,
  minHeight: 520,
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
  const [ddsFormat, setDdsFormat] = useState<string>("BC7RgbaUnormSrgb");
  const [isDetectingFormat, setIsDetectingFormat] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);

  const targetFileUrl = selectedItem?.fileUrl ?? "";
  const canEdit = Boolean(folderPath && convertDirPath && targetFileUrl);
  const defaultPreviewPngPath = useMemo(() => {
    if (!selectedItem?.name) return "";
    return buildCardIconPreviewPath(convertDirPath, selectedItem.name) ?? "";
  }, [convertDirPath, selectedItem?.name]);

  const previewSrc = useMemo(() => {
    if (pngPath) return convertFileSrc(pngPath);
    return defaultPreviewPngPath ? convertFileSrc(defaultPreviewPngPath) : null;
  }, [defaultPreviewPngPath, pngPath]);

  const handlePngPicked = useCallback((picked: string | string[]) => {
    if (Array.isArray(picked)) {
      setPngPath(picked[0] ?? "");
      return;
    }
    setPngPath(picked);
  }, []);

  useEffect(() => {
    const detectDdsFormat = async () => {
      if (!openState || !folderPath || !targetFileUrl) return;
      try {
        setIsDetectingFormat(true);
        const nutexbPath = await resolveFullPath(folderPath, targetFileUrl);
        if (!nutexbPath) {
          throw new Error("Failed to resolve nutexb path");
        }
        const detected = await invoke<string>("card_icon_detect_dds_format", { nutexbPath });
        const matched = DDS_FORMATS.find((opt) => opt.value === detected);
        if (!matched) {
          throw new Error(`Unsupported DDS format from nutexb: ${detected}`);
        }
        setDdsFormat(matched.value);
      } catch (error) {
        console.error(error);
        const message =
          error instanceof Error ? error.message : "Failed to detect original DDS format";
        toast.error(message);
      } finally {
        setIsDetectingFormat(false);
      }
    };
    void detectDdsFormat();
  }, [folderPath, openState, targetFileUrl]);

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
    const sourcePngPath = pngPath || defaultPreviewPngPath;
    if (!sourcePngPath) {
      toast.error("No source PNG available");
      return;
    }
    if (!(await exists(sourcePngPath))) {
      toast.error("Source PNG does not exist");
      return;
    }

    try {
      setIsReplacing(true);
      const nutexbPath = await resolveFullPath(folderPath, targetFileUrl);
      if (!nutexbPath) {
        toast.error("Failed to resolve nutexb path");
        return;
      }
      const result = await invoke<ReplaceSummary>("card_icon_replace_from_png_with_dds_format", {
        nutexbPath,
        convertDir: convertDirPath,
        pngPath: sourcePngPath,
        ddsFormat,
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
  }, [
    convertDirPath,
    ddsFormat,
    folderPath,
    onApplied,
    pngPath,
    selectedItem,
    targetFileUrl,
    defaultPreviewPngPath,
  ]);

  return (
    <>
      <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => setOpenState(true)}>
        {triggerLabel}
      </Button>
      {openState ? (
        <AppRndModalShell
          titleId="card-icon-replace-title"
          title="Replace Card Icon"
          subtitle="Replaces the selected nutexb and refreshes the __convert preview PNG."
          headerIcon={<ImageIcon className="h-5 w-5 text-primary" />}
          dimensions={CARD_ICON_REPLACE_MODAL_DIMENSIONS}
          storageKey="app.rnd-size.card-icon-replace"
          onClose={() => setOpenState(false)}
          closeDisabled={isReplacing}
        >
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
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
              <Label>DDS Format</Label>
              <Select
                value={ddsFormat}
                onValueChange={setDdsFormat}
                disabled={isReplacing || isDetectingFormat}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select DDS format" />
                </SelectTrigger>
                <SelectContent>
                  {DDS_FORMATS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground min-h-8 leading-snug">
                {isDetectingFormat
                  ? "Detecting original format from target nutexb..."
                  : "Default is the original format from the target nutexb file."}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="card-icon-replace-png">Source PNG (optional)</Label>
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
                If empty, it uses the current <span className="font-mono">__convert</span> preview PNG.
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpenState(false)} disabled={isReplacing}>
                Cancel
              </Button>
              <Button
                onClick={() => void handleApply()}
                disabled={isReplacing || isDetectingFormat || !canEdit || (!pngPath && !defaultPreviewPngPath)}
              >
                {isReplacing ? "Replacing..." : "Apply"}
              </Button>
            </div>
          </div>
            </div>
          </div>
        </AppRndModalShell>
      ) : null}
    </>
  );
}
