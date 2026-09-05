import { useCallback, useEffect, useState, type WheelEvent } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { Image, Loader2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import type { TextureManagerEntry } from "../store/sceneTextureManagerStore";
import type { NutexbTextureDataMap } from "../hooks/useSceneTextureLoader";
import type { SceneTextureDecodeContext } from "../utils/sceneTextureDecode";
import {
  extractRgbaFromTextureData,
  lookupSceneTextureData,
  resolveSceneTexturePreviewDataUrl,
} from "../utils/sceneTextureThumbnail";
import { TextureFormatSelect, type DdsFormat } from "./TextureFormatSelect";
import {
  DEFAULT_DDS_FORMAT,
  formatMatchesDetected,
  normalizeDdsFormat,
  resolveDetectedDdsFormat,
} from "../utils/sceneTextureDdsFormat";
import { SCENE_EDIT_RND_SIZE_KEYS } from "./sceneEditRndSizePersistence";

const TEXTURE_PREVIEW_DIMENSIONS = {
  width: 560,
  height: 520,
  minWidth: 280,
  minHeight: 260,
};
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const ZOOM_STEP = 0.12;

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

interface TexturePreviewModalProps {
  entry: TextureManagerEntry;
  textureDataMap: NutexbTextureDataMap;
  decodeContext: SceneTextureDecodeContext;
  onClose: () => void;
  onFormatApply?: (ddsFormat: DdsFormat) => void;
  isReencoding?: boolean;
}

export function TexturePreviewModal({
  entry,
  textureDataMap,
  decodeContext,
  onClose,
  onFormatApply,
  isReencoding = false,
}: TexturePreviewModalProps) {
  const { t } = useTranslation("scene-texture-dialogs");
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ddsFormat, setDdsFormat] = useState<DdsFormat>(DEFAULT_DDS_FORMAT);
  const [detectedFormat, setDetectedFormat] = useState<string | null>(null);
  const [formatLoading, setFormatLoading] = useState(false);
  const [zoom, setZoom] = useState(1);

  const loadedData = entry.nutexbPath
    ? lookupSceneTextureData(textureDataMap, entry.nutexbPath)
    : null;
  const loadedRgba = extractRgbaFromTextureData(loadedData);

  useEffect(() => {
    if (!entry.nutexbPath) {
      setLoading(false);
      setError(t("texturePreview.noPath"));
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setPreviewDataUrl(null);
    setZoom(1);

    resolveSceneTexturePreviewDataUrl(
      entry.nutexbPath,
      textureDataMap,
      decodeContext,
    )
      .then((dataUrl) => {
        if (cancelled) return;
        if (!dataUrl) {
          setError(t("texturePreview.loadFailed"));
          return;
        }
        setPreviewDataUrl(dataUrl);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(typeof err === "string" ? err : t("texturePreview.loadFailed"));
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [entry.nutexbPath, textureDataMap, decodeContext]);

  useEffect(() => {
    if (!entry.nutexbPath) return;

    let cancelled = false;
    setFormatLoading(true);

    invoke<string>("card_icon_detect_dds_format", { nutexbPath: entry.nutexbPath })
      .then((rustFormat) => {
        if (cancelled) return;
        setDetectedFormat(rustFormat);
        const fromEntry = normalizeDdsFormat(entry.format);
        const fromRust = resolveDetectedDdsFormat(rustFormat);
        setDdsFormat(fromRust ?? fromEntry);
      })
      .catch(() => {
        if (cancelled) return;
        setDdsFormat(normalizeDdsFormat(entry.format));
      })
      .finally(() => {
        if (!cancelled) {
          setFormatLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [entry.nutexbPath, entry.format]);

  const formatDirty =
    detectedFormat !== null &&
    !formatMatchesDetected(ddsFormat, detectedFormat);

  const handleApplyFormat = useCallback(() => {
    if (!formatDirty || !onFormatApply) return;
    onFormatApply(ddsFormat);
  }, [ddsFormat, formatDirty, onFormatApply]);

  const adjustZoom = useCallback((direction: 1 | -1) => {
    setZoom((prev) => {
      const factor = 1 + ZOOM_STEP * direction;
      return clampZoom(direction > 0 ? prev * factor : prev / (1 + ZOOM_STEP));
    });
  }, []);

  const resetZoom = useCallback(() => setZoom(1), []);

  const handlePreviewWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (!previewDataUrl || loading) return;
      event.preventDefault();
      event.stopPropagation();
      adjustZoom(event.deltaY < 0 ? 1 : -1);
    },
    [adjustZoom, loading, previewDataUrl],
  );

  const previewWidth = loadedRgba?.width ?? entry.width;
  const previewHeight = loadedRgba?.height ?? entry.height;

  const headerActions = (
    <>
              {previewWidth > 0 && previewHeight > 0 && (
                <span className="text-[10px] text-muted-foreground font-mono" title={t("texturePreview.dimensions")}>
                  {previewWidth}×{previewHeight}
                </span>
              )}
                <span className="w-9 text-right font-mono text-[10px] text-muted-foreground" aria-label={t("texturePreview.zoomPercent")}>
                {Math.round(zoom * 100)}%
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                data-no-drag
                title={t("texturePreview.zoomOut")}
                onClick={() => adjustZoom(-1)}
                disabled={isReencoding || !previewDataUrl || zoom <= MIN_ZOOM}
              >
                <ZoomOut className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                data-no-drag
                title={t("texturePreview.resetZoom")}
                onClick={resetZoom}
                disabled={isReencoding || !previewDataUrl || zoom === 1}
              >
                <RotateCcw className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                data-no-drag
                title={t("texturePreview.zoomIn")}
                onClick={() => adjustZoom(1)}
                disabled={isReencoding || !previewDataUrl || zoom >= MAX_ZOOM}
              >
                <ZoomIn className="h-3 w-3" />
              </Button>
    </>
  );

  const content = (
    <AppRndModalShell
      titleId="texture-preview-modal-title"
      title={entry.filename}
      subtitle={t("texturePreview.subtitle")}
      headerIcon={<Image className="h-4 w-4 text-primary" />}
      headerActions={headerActions}
      dimensions={TEXTURE_PREVIEW_DIMENSIONS}
      storageKey={SCENE_EDIT_RND_SIZE_KEYS.texturePreview}
      onClose={onClose}
      closeDisabled={isReencoding}
    >
          <div
            className="flex flex-1 items-center justify-center bg-[repeating-conic-gradient(#80808020_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] overflow-auto p-2 min-h-0"
            data-no-drag
            onWheel={handlePreviewWheel}
          >
            {loading && (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-xs">{t("texturePreview.loading")}</span>
              </div>
            )}
            {error && (
              <span className="text-xs text-destructive">{error}</span>
            )}
            {previewDataUrl && !loading && (
              <div
                className="flex items-center justify-center"
                style={{
                  minWidth: "100%",
                  minHeight: "100%",
                  width: zoom > 1 ? `${zoom * 100}%` : "100%",
                  height: zoom > 1 ? `${zoom * 100}%` : "100%",
                }}
              >
                <img
                  src={previewDataUrl}
                  alt={entry.filename}
                  className="block object-contain"
                  style={{
                    width: zoom > 1 ? "100%" : `${zoom * 100}%`,
                    height: zoom > 1 ? "100%" : `${zoom * 100}%`,
                  }}
                  draggable={false}
                />
              </div>
            )}
          </div>

          <div
            className="flex flex-col gap-2 px-3 py-2 border-t shrink-0"
            data-no-drag
          >
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground">
                {t("texturePreview.ddsFormat")}
              </label>
              <TextureFormatSelect
                value={ddsFormat}
                onChange={setDdsFormat}
                disabled={formatLoading || isReencoding}
                triggerClassName="h-7 text-xs w-full"
              />
              <div className="text-[10px] text-muted-foreground min-h-4 leading-snug">
                {formatLoading
                    ? t("texturePreview.detectingFormat")
                  : t("texturePreview.defaultFormat")}
              </div>
            </div>
            {formatDirty && onFormatApply && (
              <Button
                size="sm"
                className="w-full text-xs h-7"
                onClick={handleApplyFormat}
                disabled={isReencoding}
              >
                {isReencoding ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    {t("texturePreview.reencoding")}
                  </>
                ) : (
                  t("texturePreview.applyFormat")
                )}
              </Button>
            )}
          </div>
    </AppRndModalShell>
  );

  return createPortal(content, document.body);
}
