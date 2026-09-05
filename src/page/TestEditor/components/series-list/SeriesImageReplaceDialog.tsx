import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { dirname } from "@tauri-apps/api/path";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";
import { ImageIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation("test-lists");
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
    if (!seriesImageConvertDirPath) return t("series.imageDialog.convertMissing");
    if (!seriesImageWritable) return t("series.imageDialog.packReadOnly");
    if (!baseName) {
      const max =
        seriesImageSeriesBaseNameOrder && seriesImageSeriesBaseNameOrder.length > 0
          ? seriesImageSeriesBaseNameOrder.length - 1
          : -1;
      return t("series.imageDialog.indexOutOfRange", { max });
    }
    if (strictMsIndex === null) return t("series.imageDialog.unsupportedNameDetail", { name: baseName });
    return "";
  }, [baseName, seriesImageConvertDirPath, seriesImageSeriesBaseNameOrder, seriesImageWritable, strictMsIndex, t]);

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
    if (!seriesImageConvertDirPath) return t("series.imageDialog.convertMissing");
    if (!seriesImageStructureJsonPath) return t("series.imageDialog.structureMissing");
    if (!seriesImageWritable) return t("series.imageDialog.packReadOnly");
    if (nextSerMsIndex === null) return t("series.imageDialog.noSlot");
    return "";
  }, [nextSerMsIndex, seriesImageConvertDirPath, seriesImageStructureJsonPath, seriesImageWritable, t]);

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
      toast.error(t("series.imageDialog.selectPng"));
      return;
    }
    if (validationErrorReplace || !targetNutexbName) {
      toast.error(validationErrorReplace || t("series.imageDialog.invalidMapping"));
      return;
    }
    if (!baseName || strictMsIndex === null) {
      toast.error(validationErrorReplace || t("series.imageDialog.unsupportedName"));
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

      toast.success(t("series.imageDialog.updated", { name: result.nutexbName }));
      onApplied(iconFileIndex);
      setPreviewVersion((v) => v + 1);
      setOpen(false);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : t("series.imageDialog.replaceFailed"));
    } finally {
      setIsReplacing(false);
    }
  }, [baseName, iconFileIndex, onApplied, pngPath, seriesImageConvertDirPath, setOpen, strictMsIndex, t, targetNutexbName, validationErrorReplace]);

  const handleAddNewSeriesImage = useCallback(async () => {
    if (!seriesImageConvertDirPath) {
      toast.error(t("series.imageDialog.convertMissing"));
      return;
    }
    if (!seriesImageStructureJsonPath) {
      toast.error(t("series.imageDialog.structureMissing"));
      return;
    }
    if (!pngPath) {
      toast.error(t("series.imageDialog.selectPng"));
      return;
    }
    if (validationErrorAdd || nextSerMsIndex === null) {
      toast.error(validationErrorAdd || t("series.imageDialog.cannotComputeSlot"));
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
        toast.error(t("series.imageDialog.noSlot"));
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

      toast.success(t("series.imageDialog.created", { name: replaceResult.nutexbName }));

      onApplied(nextIconFileIndex);
      if (onRefreshSeriesImages) {
        await onRefreshSeriesImages();
      }
      setPreviewVersion((v) => v + 1);
      setOpen(false);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : t("series.imageDialog.createFailed"));
    } finally {
      setIsAppending(false);
    }
  }, [nextSerMsIndex, onApplied, onRefreshSeriesImages, pngPath, seriesImageConvertDirPath, seriesImageStructureJsonPath, setOpen, t, validationErrorAdd]);

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
                    alt={t("series.previewAlt")}
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
            <span className="text-sm text-muted-foreground">{t("common.noPreview")}</span>
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
          title={t("series.imageDialog.title")}
          subtitle={t("series.imageDialog.subtitle")}
          headerIcon={<ImageIcon className="h-5 w-5 text-primary" />}
          dimensions={SERIES_IMAGE_REPLACE_MODAL_DIMENSIONS}
          storageKey="app.rnd-size.series-image-replace"
          onClose={() => setOpen(false)}
          closeDisabled={isReplacing || isAppending}
        >
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            <p className="mb-4 text-xs text-muted-foreground">
              {t("series.imageDialog.addWrites")}{" "}
              <span className="font-mono" data-i18n-ignore="">
                0xA0253AA0_structure.json
              </span>
              .
            </p>
            <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <Label>{t("common.preview")}</Label>
            {previewZoom}
            <div className="text-xs text-muted-foreground min-h-8 leading-snug">
              {pngPath ? t("series.imageDialog.previewSelected") : t("series.imageDialog.previewCurrent")}
            </div>
          </div>

          <div className="space-y-4 min-h-0 flex flex-col">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SeriesImageTab)} className="flex flex-col flex-1 min-h-0">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="replace">{t("series.imageDialog.replaceExisting")}</TabsTrigger>
                <TabsTrigger value="add">{t("series.imageDialog.addNew")}</TabsTrigger>
              </TabsList>

              <TabsContent value="replace" className="mt-4 space-y-4 flex-1">
                <div className="space-y-2">
                  <Label htmlFor="series-nutexb-file-name">{t("series.imageDialog.targetByIndex")}</Label>
                  <Input
                    id="series-nutexb-file-name"
                    value={targetNutexbName ?? ""}
                    readOnly
                    placeholder={t("series.imageDialog.outOfRange")}
                  />
                  <div className="text-xs text-muted-foreground min-h-8 leading-snug">
                    {t("series.imageDialog.resolvedFrom")}{" "}
                    <span className="font-mono" data-i18n-ignore="">
                      0xA0253AA0_structure.json
                    </span>{" "}
                    {t("series.imageDialog.using")}{" "}
                    <span className="font-mono" data-i18n-ignore="">
                      iconFileIndex
                    </span>{" "}
                    {t("series.imageDialog.asIndex")}
                    {seriesImageSeriesBaseNameOrder && seriesImageSeriesBaseNameOrder.length > 0 && (
                      <> {t("series.imageDialog.mappedEntries", { count: seriesImageSeriesBaseNameOrder.length })}</>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="series-replace-png">{t("common.sourcePng")}</Label>
                  <FilePathInput
                    id="series-replace-png"
                    value={pngPath}
                    placeholder={t("common.selectPng")}
                    picker={{
                      kind: "file",
                      multiple: false,
                      title: t("common.selectPngTitle"),
                      filters: [{ name: "PNG", extensions: ["png"] }],
                    }}
                    onPickedValue={handlePngPicked}
                    disabled={isReplacing}
                  />
                </div>

                {validationErrorReplace && <div className="text-sm text-destructive">{validationErrorReplace}</div>}

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setOpen(false)} disabled={isReplacing || isAppending}>
                    {t("common.cancel")}
                  </Button>
                  <Button onClick={() => void handleApplyReplace()} disabled={!canReplaceApply}>
                    {isReplacing ? t("common.replacing") : t("series.imageDialog.replaceImage")}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="add" className="mt-4 space-y-4 flex-1">
                <div className="space-y-2">
                  <Label>{t("series.imageDialog.nextSlot")}</Label>
                  <Input
                    value={nextBaseNamePreview ? `${nextBaseNamePreview}.nutexb` : t("series.imageDialog.unavailable")}
                    readOnly
                  />
                  <div className="text-xs text-muted-foreground leading-snug">
                    {t("series.imageDialog.addHint")}{" "}
                    <span className="font-mono" data-i18n-ignore="">
                      iconFileIndex
                    </span>{" "}
                    {t("series.imageDialog.willBe")}{" "}
                    <span className="font-mono" data-i18n-ignore="">
                      {seriesImageSeriesBaseNameOrder ? seriesImageSeriesBaseNameOrder.length : "—"}
                    </span>
                    .
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="series-add-png">{t("common.sourcePng")}</Label>
                  <FilePathInput
                    id="series-add-png"
                    value={pngPath}
                    placeholder={t("common.selectPng")}
                    picker={{
                      kind: "file",
                      multiple: false,
                      title: t("common.selectPngTitle"),
                      filters: [{ name: "PNG", extensions: ["png"] }],
                    }}
                    onPickedValue={handlePngPicked}
                    disabled={isAppending}
                  />
                </div>

                {validationErrorAdd && <div className="text-sm text-destructive">{validationErrorAdd}</div>}

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setOpen(false)} disabled={isReplacing || isAppending}>
                    {t("common.cancel")}
                  </Button>
                  <Button onClick={() => void handleAddNewSeriesImage()} disabled={!canAddExecute}>
                    {isAppending ? t("series.imageDialog.adding") : t("series.imageDialog.addImage")}
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
