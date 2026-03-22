import { useCallback, useMemo, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { dirname, join } from "@tauri-apps/api/path";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilePathInput } from "@/components/ui/filePathInput";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { getPathSeparatorFromFileUrl } from "@/lib/fhm2d_fileUrlUtils";
import {
  formatSeriesNutexbFileNameFromBaseName,
  formatSeriesPngFileNameFromBaseName,
  extractA0253FirstFolderSeriesBaseNameOrder,
  resolveMappedSeriesBaseName,
  tryParseStrictSeriesMsIndex,
} from "./seriesImage";
import { appendSeriesIconToStructureJson, computeNextSerMsIndex } from "./seriesStructure";

type ReplaceSummary = {
  outputNutexbPath: string;
  previewPngPath: string;
  nutexbName: string;
};

interface SeriesImageReplaceDialogProps {
  iconFileIndex: number;
  seriesImageConvertDirPath?: string;
  seriesImageSeriesBaseNameOrder?: Array<string | null>;
  onRefreshSeriesImages?: () => Promise<void> | void;
  onApplied: (nextIconFileIndex: number) => void;
}

export function SeriesImageReplaceDialog({
  iconFileIndex,
  seriesImageConvertDirPath,
  seriesImageSeriesBaseNameOrder,
  onRefreshSeriesImages,
  onApplied,
}: SeriesImageReplaceDialogProps) {
  const [openState, setOpenState] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const [isAppending, setIsAppending] = useState(false);
  const [pngPath, setPngPath] = useState<string>("");
  const [previewVersion, setPreviewVersion] = useState(0);

  const baseName = useMemo(
    () => resolveMappedSeriesBaseName(seriesImageSeriesBaseNameOrder, iconFileIndex),
    [iconFileIndex, seriesImageSeriesBaseNameOrder]
  );
  const strictMsIndex = useMemo(() => (baseName ? tryParseStrictSeriesMsIndex(baseName) : null), [baseName]);
  const targetNutexbName = useMemo(
    () => (baseName ? formatSeriesNutexbFileNameFromBaseName(baseName) : null),
    [baseName]
  );
  const currentPreviewPngName = useMemo(
    () => (baseName ? formatSeriesPngFileNameFromBaseName(baseName) : null),
    [baseName]
  );

  const validationError = useMemo(() => {
    if (!seriesImageConvertDirPath) return "Series image convert folder is not available";
    if (!baseName) {
      const max =
        seriesImageSeriesBaseNameOrder && seriesImageSeriesBaseNameOrder.length > 0
          ? seriesImageSeriesBaseNameOrder.length - 1
          : -1;
      return `iconFileIndex is out of range (0 - ${max})`;
    }
    // Backend only supports strict "ser_ms_###" mapping for replace.
    if (strictMsIndex === null) return `Unsupported series Name "${baseName}" for replace (backend expects "ser_ms_###")`;
    return "";
  }, [baseName, seriesImageConvertDirPath, seriesImageSeriesBaseNameOrder, strictMsIndex]);

  const canEdit = Boolean(seriesImageConvertDirPath);
  const canApply = canEdit && Boolean(pngPath) && !validationError && !isReplacing && !isAppending;
  const canAppend = canEdit && Boolean(pngPath) && !isAppending && !isReplacing;

  const previewSrc = useMemo(() => {
    // Prefer showing the selected PNG (what will be applied).
    if (pngPath) return convertFileSrc(pngPath);
    if (!seriesImageConvertDirPath) return null;

    if (!currentPreviewPngName) return null;

    const sep = getPathSeparatorFromFileUrl(seriesImageConvertDirPath);
    const base = seriesImageConvertDirPath.endsWith(sep)
      ? `${seriesImageConvertDirPath}${currentPreviewPngName}`
      : `${seriesImageConvertDirPath}${sep}${currentPreviewPngName}`;

    const url = convertFileSrc(base);
    const q = url.includes("?") ? "&" : "?";
    return `${url}${q}v=${previewVersion}`;
  }, [iconFileIndex, pngPath, previewVersion, seriesImageConvertDirPath]);

  const handlePngPicked = useCallback((picked: string | string[]) => {
    if (Array.isArray(picked)) {
      if (picked.length > 0) {
        setPngPath(picked[0]);
      }
    } else {
      setPngPath(picked);
    }
  }, []);

  const handleApply = useCallback(async () => {
    if (!seriesImageConvertDirPath) return;
    if (!pngPath) {
      toast.error("Please select a PNG file");
      return;
    }
    if (validationError || !targetNutexbName) {
      toast.error(validationError || "Invalid iconFileIndex mapping");
      return;
    }
    if (!baseName || strictMsIndex === null) {
      toast.error(validationError || "Unsupported series Name");
      return;
    }

    try {
      setIsReplacing(true);
      const seriesImageDir = await dirname(seriesImageConvertDirPath);
      const result = await invoke<ReplaceSummary>("series_image_replace_from_png", {
        seriesImageDir,
        seriesImageConvertDir: seriesImageConvertDirPath,
        iconFileIndex: strictMsIndex,
        fileName: targetNutexbName,
        pngPath,
      });

      toast.success(`Updated series image: ${result.nutexbName}`);
      onApplied(iconFileIndex);
      setPreviewVersion((v) => v + 1);
      setOpenState(false);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to replace series image");
    } finally {
      setIsReplacing(false);
    }
  }, [baseName, iconFileIndex, onApplied, pngPath, seriesImageConvertDirPath, strictMsIndex, targetNutexbName, validationError]);

  const handleCreateNew = useCallback(async () => {
    if (!seriesImageConvertDirPath) {
      toast.error("Series image convert folder is not available");
      return;
    }
    if (!pngPath) {
      toast.error("Please select a PNG file");
      return;
    }
    setIsAppending(true);
    try {
      const seriesImageDir = await dirname(seriesImageConvertDirPath);
      const projectRootDir = await dirname(seriesImageDir);
      const structurePath = await join(projectRootDir, "0xA0253AA0_structure.json");

      const structRaw = await readFile(structurePath);
      const structText = new TextDecoder().decode(structRaw);
      const structJson = JSON.parse(structText);

      const seriesBaseNameOrder = extractA0253FirstFolderSeriesBaseNameOrder(structJson);
      const nextSerMsIndex = computeNextSerMsIndex(seriesBaseNameOrder);
      if (!nextSerMsIndex) {
        toast.error("No available ser_ms index (max 999)");
        return;
      }

      const nextBaseName = `ser_ms_${nextSerMsIndex.toString().padStart(3, "0")}`;
      const nextIconFileIndex = seriesBaseNameOrder.length;

      const { nextStructJson } = appendSeriesIconToStructureJson(structJson, {
        baseName: nextBaseName,
      });

      const targetNutexb = `${nextBaseName}.nutexb`;

      const seriesImageDirParent = seriesImageDir;
      const replaceResult = await invoke<ReplaceSummary>("series_image_replace_from_png", {
        seriesImageDir: seriesImageDirParent,
        seriesImageConvertDir: seriesImageConvertDirPath,
        iconFileIndex: nextSerMsIndex,
        fileName: targetNutexb,
        pngPath,
      });

      const encoded = new TextEncoder().encode(JSON.stringify(nextStructJson, null, 2));
      await writeFile(structurePath, encoded);

      toast.success(`Created series image: ${replaceResult.nutexbName}`);

      onApplied(nextIconFileIndex);
      if (onRefreshSeriesImages) {
        await onRefreshSeriesImages();
      }
      setPreviewVersion((v) => v + 1);
      setOpenState(false);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to create new series icon");
    } finally {
      setIsAppending(false);
    }
  }, [onApplied, onRefreshSeriesImages, pngPath, seriesImageConvertDirPath]);

  return (
    <Dialog open={openState} onOpenChange={setOpenState}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={!canEdit}>
          Edit Image
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[920px]">
        <DialogHeader>
          <DialogTitle>Replace Series Image</DialogTitle>
          <DialogDescription>
            Replaces/creates the Nutexb and refreshes the preview PNG under <span className="font-mono">__convert</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <Label>Preview</Label>
            <Card className="overflow-hidden transform-3d min-h-[440px]" style={{ willChange: "transform" }}>
              <AspectRatio ratio={1} className="bg-black backface-hidden flex items-center justify-center">
                {previewSrc ? (
                  <TransformWrapper
                    initialScale={0.9}
                    minScale={0.5}
                    maxScale={6}
                    centerOnInit
                    smooth
                    doubleClick={{ disabled: false }}
                    limitToBounds={false}
                    wheel={{ step: 0.05 }}
                  >
                    {({ zoomIn, zoomOut, resetTransform }) => (
                      <>
                        <TransformComponent
                          wrapperClass="!w-full [transform-style:preserve-3d] flex items-center justify-center"
                          contentClass="!w-full [backface-visibility:hidden] flex items-center justify-center"
                          wrapperStyle={{ willChange: "transform", height: "100%" }}
                        >
                          <img
                            src={previewSrc}
                            alt="Series preview"
                            className="w-full h-full object-contain [image-rendering:optimizeSpeed] transform-[translateZ(0)] mx-auto"
                            style={{
                              imageRendering: "-webkit-optimize-contrast",
                              backfaceVisibility: "hidden",
                              perspective: 1000,
                              transform: "translate3d(0,0,0)",
                              display: "block",
                              margin: "auto",
                            }}
                          />
                        </TransformComponent>
                        <div className="absolute bottom-4 right-4 flex gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            onClick={() => zoomIn()}
                            className="h-8 w-8 rounded-full bg-card/80 hover:bg-card/90"
                          >
                            +
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            onClick={() => zoomOut()}
                            className="h-8 w-8 rounded-full bg-card/80 hover:bg-card/90"
                          >
                            -
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            onClick={() => resetTransform()}
                            className="h-8 w-8 rounded-full bg-card/80 hover:bg-card/90"
                          >
                            ↺
                          </Button>
                        </div>
                      </>
                    )}
                  </TransformWrapper>
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
            <Label htmlFor="series-nutexb-file-name">Target Nutexb (by iconFileIndex index)</Label>
            <Input
              id="series-nutexb-file-name"
              value={targetNutexbName ?? ""}
              readOnly
              placeholder="(out of range)"
            />
            <div className="text-xs text-muted-foreground min-h-8 leading-snug">
              The file is resolved from <span className="font-mono">0xA0253AA0_structure.json</span> using{" "}
              <span className="font-mono">iconFileIndex</span> as a 0-based index.
              {seriesImageSeriesBaseNameOrder && seriesImageSeriesBaseNameOrder.length > 0 && (
                <> Mapped entries: <span className="font-mono">{seriesImageSeriesBaseNameOrder.length}</span>.</>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="series-replace-png">Source PNG</Label>
            <FilePathInput
              id="series-replace-png"
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

          {validationError && <div className="text-sm text-destructive">{validationError}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpenState(false)} disabled={isReplacing || isAppending}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreateNew()} disabled={!canAppend}>
              {isAppending ? "Creating..." : "Create New"}
            </Button>
            <Button onClick={() => void handleApply()} disabled={!canApply}>
              {isReplacing ? "Replacing..." : "Apply"}
            </Button>
          </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


