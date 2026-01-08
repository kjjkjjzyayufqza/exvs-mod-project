import { useCallback, useEffect, useMemo, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { dirname } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { getPathSeparatorFromFileUrl } from "@/lib/fhm2d_fileUrlUtils";

type ReplaceSummary = {
  outputNutexbPath: string;
  previewPngPath: string;
  nutexbName: string;
};

function parseSeriesNutexbFileName(fileName: string): { iconFileIndex: number } | null {
  const trimmed = fileName.trim();
  const m = /^ser_ms_(\d{3})\.nutexb$/.exec(trimmed);
  if (!m) return null;
  const idx = Number.parseInt(m[1] ?? "", 10);
  if (!Number.isFinite(idx) || idx < 1 || idx > 999) return null;
  return { iconFileIndex: idx };
}

function formatSeriesNutexbFileName(iconFileIndex: number): string {
  if (!Number.isFinite(iconFileIndex) || iconFileIndex < 1 || iconFileIndex > 999) return "";
  return `ser_ms_${String(iconFileIndex).padStart(3, "0")}.nutexb`;
}

function formatSeriesPreviewPng(iconFileIndex: number): string {
  if (!Number.isFinite(iconFileIndex) || iconFileIndex < 1 || iconFileIndex > 999) return "";
  return `ser_ms_${String(iconFileIndex).padStart(3, "0")}.png`;
}

interface SeriesImageReplaceDialogProps {
  iconFileIndex: number;
  seriesImageConvertDirPath?: string;
  onApplied: (nextIconFileIndex: number) => void;
}

export function SeriesImageReplaceDialog({ iconFileIndex, seriesImageConvertDirPath, onApplied }: SeriesImageReplaceDialogProps) {
  const [openState, setOpenState] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const [pngPath, setPngPath] = useState<string>("");
  const [fileName, setFileName] = useState<string>(() => formatSeriesNutexbFileName(iconFileIndex));
  const [previewVersion, setPreviewVersion] = useState(0);

  useEffect(() => {
    if (!openState) return;
    setPngPath("");
    setFileName(formatSeriesNutexbFileName(iconFileIndex));
  }, [iconFileIndex, openState]);

  const parsed = useMemo(() => parseSeriesNutexbFileName(fileName), [fileName]);
  const validationError = useMemo(() => {
    if (!fileName.trim()) return "File name is required";
    if (!parsed) return "File name must match: ser_ms_###.nutexb (001-999)";
    return "";
  }, [fileName, parsed]);

  const canEdit = Boolean(seriesImageConvertDirPath);
  const canApply = canEdit && Boolean(pngPath) && !validationError && !isReplacing;

  const previewSrc = useMemo(() => {
    // Prefer showing the selected PNG (what will be applied).
    if (pngPath) return convertFileSrc(pngPath);
    if (!seriesImageConvertDirPath) return null;

    const previewFile = formatSeriesPreviewPng(iconFileIndex);
    if (!previewFile) return null;

    const sep = getPathSeparatorFromFileUrl(seriesImageConvertDirPath);
    const base = seriesImageConvertDirPath.endsWith(sep)
      ? `${seriesImageConvertDirPath}${previewFile}`
      : `${seriesImageConvertDirPath}${sep}${previewFile}`;

    const url = convertFileSrc(base);
    const q = url.includes("?") ? "&" : "?";
    return `${url}${q}v=${previewVersion}`;
  }, [iconFileIndex, pngPath, previewVersion, seriesImageConvertDirPath]);

  const handlePickPng = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "PNG", extensions: ["png"] }],
      });
      if (!selected || Array.isArray(selected)) return;
      setPngPath(selected);
    } catch (e) {
      console.error(e);
      toast.error("Failed to pick PNG");
    }
  }, []);

  const handleApply = useCallback(async () => {
    if (!seriesImageConvertDirPath) return;
    if (!pngPath) {
      toast.error("Please select a PNG file");
      return;
    }
    if (validationError || !parsed) {
      toast.error(validationError || "Invalid file name");
      return;
    }

    try {
      setIsReplacing(true);
      const seriesImageDir = await dirname(seriesImageConvertDirPath);
      const result = await invoke<ReplaceSummary>("series_image_replace_from_png", {
        seriesImageDir,
        seriesImageConvertDir: seriesImageConvertDirPath,
        iconFileIndex: parsed.iconFileIndex,
        fileName: fileName.trim(),
        pngPath,
      });

      toast.success(`Updated series image: ${result.nutexbName}`);
      onApplied(parsed.iconFileIndex);
      setPreviewVersion((v) => v + 1);
      setOpenState(false);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to replace series image");
    } finally {
      setIsReplacing(false);
    }
  }, [fileName, onApplied, parsed, pngPath, seriesImageConvertDirPath, validationError]);

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
                            className="h-8 w-8 rounded-full bg-white/80 hover:bg-white/90"
                          >
                            +
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            onClick={() => zoomOut()}
                            className="h-8 w-8 rounded-full bg-white/80 hover:bg-white/90"
                          >
                            -
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            onClick={() => resetTransform()}
                            className="h-8 w-8 rounded-full bg-white/80 hover:bg-white/90"
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
            <Label htmlFor="series-nutexb-file-name">Nutexb File Name</Label>
            <Input
              id="series-nutexb-file-name"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="ser_ms_001.nutexb"
              disabled={isReplacing}
            />
            <div className="text-xs text-muted-foreground min-h-8 leading-snug">
              Must match <span className="font-mono">ser_ms_###.nutexb</span> (001-999). This will be mapped by{" "}
              <span className="font-mono">iconFileIndex</span>.
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="series-replace-png">Source PNG</Label>
            <div className="flex gap-2">
              <Input id="series-replace-png" value={pngPath} readOnly placeholder="Select a PNG file..." />
              <Button variant="outline" onClick={handlePickPng} disabled={isReplacing}>
                Browse
              </Button>
            </div>
            <div className="text-xs text-muted-foreground min-h-8 leading-snug">
              The PNG will be converted in Rust (no external executables).
            </div>
          </div>

          {validationError && <div className="text-sm text-destructive">{validationError}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpenState(false)} disabled={isReplacing}>
              Cancel
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


