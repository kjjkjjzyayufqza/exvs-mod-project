import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { dirname } from "@tauri-apps/api/path";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";
import { ImageIcon } from "lucide-react";

import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilePathInput } from "@/components/ui/filePathInput";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

type SeriesImageTab = "replace" | "add";
const SERIES_IMAGE_REPLACE_MODAL_DIMENSIONS = {
  width: 960,
  height: 780,
  minWidth: 740,
  minHeight: 560,
};

interface SeriesImageReplaceDialogProps {
  iconFileIndex: number;
  seriesImageConvertDirPath?: string;
  seriesImageStructureJsonPath?: string;
  seriesImageWritable?: boolean;
  seriesImageSeriesBaseNameOrder?: Array<string | null>;
  onRefreshSeriesImages?: () => Promise<void> | void;
  onApplied: (nextIconFileIndex: number) => void;
  /** Optional trigger (e.g. list row button). Omit when using external controls with `open` / `onOpenChange`. */
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SeriesImageReplaceDialog({
  iconFileIndex,
  seriesImageConvertDirPath,
  seriesImageStructureJsonPath,
  seriesImageWritable = false,
  seriesImageSeriesBaseNameOrder,
  onRefreshSeriesImages,
  onApplied,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: SeriesImageReplaceDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? Boolean(controlledOpen) : internalOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      controlledOnOpenChange?.(next);
      if (!isControlled) {
        setInternalOpen(next);
      }
    },
    [controlledOnOpenChange, isControlled]
  );

  const [activeTab, setActiveTab] = useState<SeriesImageTab>("replace");
  const [isReplacing, setIsReplacing] = useState(false);
  const [isAppending, setIsAppending] = useState(false);
  const [pngPath, setPngPath] = useState<string>("");
  const [previewVersion, setPreviewVersion] = useState(0);

  useEffect(() => {
    if (open) {
      setActiveTab("replace");
    }
  }, [open]);

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

  const validationErrorReplace = useMemo(() => {
    if (!seriesImageConvertDirPath) return "Series image convert folder is not available";
    if (!seriesImageWritable) return "Series image pack is read-only";
    if (!baseName) {
      const max =
        seriesImageSeriesBaseNameOrder && seriesImageSeriesBaseNameOrder.length > 0
          ? seriesImageSeriesBaseNameOrder.length - 1
          : -1;
      return `iconFileIndex is out of range (0 - ${max})`;
    }
    if (strictMsIndex === null) return `Unsupported series Name "${baseName}" for replace (backend expects "ser_ms_###")`;
    return "";
  }, [baseName, seriesImageConvertDirPath, seriesImageSeriesBaseNameOrder, seriesImageWritable, strictMsIndex]);

  const nextSerMsIndex = useMemo(
    () => computeNextSerMsIndex(seriesImageSeriesBaseNameOrder),
    [seriesImageSeriesBaseNameOrder]
  );
  const nextBaseNamePreview = useMemo(
    () =>
      nextSerMsIndex !== null ? `ser_ms_${nextSerMsIndex.toString().padStart(3, "0")}` : null,
    [nextSerMsIndex]
  );

  const validationErrorAdd = useMemo(() => {
    if (!seriesImageConvertDirPath) return "Series image convert folder is not available";
    if (!seriesImageStructureJsonPath) return "Series image structure JSON is not available";
    if (!seriesImageWritable) return "Series image pack is read-only";
    if (nextSerMsIndex === null) return "No available ser_ms index (max 999)";
    return "";
  }, [nextSerMsIndex, seriesImageConvertDirPath, seriesImageStructureJsonPath, seriesImageWritable]);

  const canEdit = Boolean(seriesImageConvertDirPath && seriesImageWritable);
  const canReplaceApply =
    canEdit &&
    Boolean(pngPath) &&
    !validationErrorReplace &&
    !isReplacing &&
    !isAppending &&
    activeTab === "replace";
  const canAddExecute =
    canEdit &&
    Boolean(pngPath) &&
    !validationErrorAdd &&
    !isAppending &&
    !isReplacing &&
    activeTab === "add";

  const previewSrc = useMemo(() => {
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
  }, [iconFileIndex, pngPath, previewVersion, seriesImageConvertDirPath, currentPreviewPngName]);

  const handlePngPicked = useCallback((picked: string | string[]) => {
    if (Array.isArray(picked)) {
      if (picked.length > 0) {
        setPngPath(picked[0]);
      }
    } else {
      setPngPath(picked);
    }
  }, []);

  const handleApplyReplace = useCallback(async () => {
    if (!seriesImageConvertDirPath) return;
    if (!pngPath) {
      toast.error("Please select a PNG file");
      return;
    }
    if (validationErrorReplace || !targetNutexbName) {
      toast.error(validationErrorReplace || "Invalid iconFileIndex mapping");
      return;
    }
    if (!baseName || strictMsIndex === null) {
      toast.error(validationErrorReplace || "Unsupported series Name");
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
      setOpen(false);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to replace series image");
    } finally {
      setIsReplacing(false);
    }
  }, [baseName, iconFileIndex, onApplied, pngPath, seriesImageConvertDirPath, setOpen, strictMsIndex, targetNutexbName, validationErrorReplace]);

  const handleAddNewSeriesImage = useCallback(async () => {
    if (!seriesImageConvertDirPath) {
      toast.error("Series image convert folder is not available");
      return;
    }
    if (!seriesImageStructureJsonPath) {
      toast.error("Series image structure JSON is not available");
      return;
    }
    if (!pngPath) {
      toast.error("Please select a PNG file");
      return;
    }
    if (validationErrorAdd || nextSerMsIndex === null) {
      toast.error(validationErrorAdd || "Cannot compute next series slot");
      return;
    }

    setIsAppending(true);
    try {
      const seriesImageDir = await dirname(seriesImageConvertDirPath);
      const structurePath = seriesImageStructureJsonPath;

      const structRaw = await readFile(structurePath);
      const structText = new TextDecoder().decode(structRaw);
      const structJson = JSON.parse(structText);

      const seriesBaseNameOrder = extractA0253FirstFolderSeriesBaseNameOrder(structJson);
      const nextSerMsIndexFresh = computeNextSerMsIndex(seriesBaseNameOrder);
      if (!nextSerMsIndexFresh) {
        toast.error("No available ser_ms index (max 999)");
        return;
      }

      const nextBaseName = `ser_ms_${nextSerMsIndexFresh.toString().padStart(3, "0")}`;
      const nextIconFileIndex = seriesBaseNameOrder.length;

      const { nextStructJson } = appendSeriesIconToStructureJson(structJson, {
        baseName: nextBaseName,
      });

      const targetNutexb = `${nextBaseName}.nutexb`;

      // 1) Write nutexb + __convert preview PNG from source PNG (disk must succeed before JSON).
      const replaceResult = await invoke<ReplaceSummary>("series_image_replace_from_png", {
        seriesImageDir,
        seriesImageConvertDir: seriesImageConvertDirPath,
        iconFileIndex: nextSerMsIndexFresh,
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
      setOpen(false);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to create new series icon");
    } finally {
      setIsAppending(false);
    }
  }, [nextSerMsIndex, onApplied, onRefreshSeriesImages, pngPath, seriesImageConvertDirPath, seriesImageStructureJsonPath, setOpen, validationErrorAdd]);

  const previewZoom = (
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
  );

  return (
    <>
      {trigger ? (
        <span className="inline-flex" onClick={() => setOpen(true)}>
          {trigger}
        </span>
      ) : null}
      {open ? (
        <AppRndModalShell
          titleId="series-image-replace-title"
          title="Replace Series Image"
          subtitle="Replace an existing nutexb or add a new slot."
          headerIcon={<ImageIcon className="h-5 w-5 text-primary" />}
          dimensions={SERIES_IMAGE_REPLACE_MODAL_DIMENSIONS}
          storageKey="app.rnd-size.series-image-replace"
          onClose={() => setOpen(false)}
          closeDisabled={isReplacing || isAppending}
        >
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            <p className="mb-4 text-xs text-muted-foreground">
              Add writes nutexb first, then updates <span className="font-mono">0xA0253AA0_structure.json</span>.
            </p>
            <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <Label>Preview</Label>
            {previewZoom}
            <div className="text-xs text-muted-foreground min-h-8 leading-snug">
              {pngPath ? "Previewing the selected PNG (will be applied)." : "Previewing current __convert PNG (if exists)."}
            </div>
          </div>

          <div className="space-y-4 min-h-0 flex flex-col">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SeriesImageTab)} className="flex flex-col flex-1 min-h-0">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="replace">Replace existing</TabsTrigger>
                <TabsTrigger value="add">Add new</TabsTrigger>
              </TabsList>

              <TabsContent value="replace" className="mt-4 space-y-4 flex-1">
                <div className="space-y-2">
                  <Label htmlFor="series-nutexb-file-name">Target Nutexb (by iconFileIndex)</Label>
                  <Input
                    id="series-nutexb-file-name"
                    value={targetNutexbName ?? ""}
                    readOnly
                    placeholder="(out of range)"
                  />
                  <div className="text-xs text-muted-foreground min-h-8 leading-snug">
                    Resolved from <span className="font-mono">0xA0253AA0_structure.json</span> using{" "}
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
                </div>

                {validationErrorReplace && <div className="text-sm text-destructive">{validationErrorReplace}</div>}

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setOpen(false)} disabled={isReplacing || isAppending}>
                    Cancel
                  </Button>
                  <Button onClick={() => void handleApplyReplace()} disabled={!canReplaceApply}>
                    {isReplacing ? "Replacing..." : "Replace image"}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="add" className="mt-4 space-y-4 flex-1">
                <div className="space-y-2">
                  <Label>Next slot</Label>
                  <Input
                    value={nextBaseNamePreview ? `${nextBaseNamePreview}.nutexb` : "(unavailable)"}
                    readOnly
                  />
                  <div className="text-xs text-muted-foreground leading-snug">
                    Converts your PNG to a new nutexb and preview PNG, then appends one entry to structure JSON. New{" "}
                    <span className="font-mono">iconFileIndex</span> will be{" "}
                    <span className="font-mono">
                      {seriesImageSeriesBaseNameOrder ? seriesImageSeriesBaseNameOrder.length : "—"}
                    </span>
                    .
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="series-add-png">Source PNG</Label>
                  <FilePathInput
                    id="series-add-png"
                    value={pngPath}
                    placeholder="Select a PNG file..."
                    picker={{
                      kind: "file",
                      multiple: false,
                      title: "Select PNG file",
                      filters: [{ name: "PNG", extensions: ["png"] }],
                    }}
                    onPickedValue={handlePngPicked}
                    disabled={isAppending}
                  />
                </div>

                {validationErrorAdd && <div className="text-sm text-destructive">{validationErrorAdd}</div>}

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setOpen(false)} disabled={isReplacing || isAppending}>
                    Cancel
                  </Button>
                  <Button onClick={() => void handleAddNewSeriesImage()} disabled={!canAddExecute}>
                    {isAppending ? "Adding..." : "Add series image"}
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
          </div>
        </AppRndModalShell>
      ) : null}
    </>
  );
}
