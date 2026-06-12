import { useCallback, useEffect, useState, type ComponentProps, type WheelEvent } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { Rnd } from "react-rnd";
import { Loader2, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
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
import { clampRndSizeToConstraints } from "./sceneEditRndModalUtils";
import {
  SCENE_EDIT_RND_SIZE_KEYS,
  persistSceneEditRndSize,
  resolveSceneEditRndInitialSize,
} from "./sceneEditRndSizePersistence";

const VIEWPORT_MARGIN = 32;
const PREVIEW_MODAL_ID = "texture-preview-modal-layer";
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const ZOOM_STEP = 0.12;

function getViewportSize() {
  if (typeof window === "undefined") return { width: 1280, height: 800 };
  return { width: window.innerWidth, height: window.innerHeight };
}

function getTexturePreviewModalDimensions() {
  const { width: vw, height: vh } = getViewportSize();
  const width = Math.min(560, vw - VIEWPORT_MARGIN * 2);
  const height = Math.min(520, vh - VIEWPORT_MARGIN * 2);
  return {
    width,
    height,
    minWidth: 280,
    minHeight: 260,
    maxWidth: vw - VIEWPORT_MARGIN,
    maxHeight: vh - VIEWPORT_MARGIN,
  };
}

function getCenteredModalPosition(size: { width: number; height: number }) {
  const { width: vw, height: vh } = getViewportSize();
  return {
    x: Math.round((vw - size.width) / 2),
    y: Math.round((vh - size.height) / 2),
  };
}

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
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ddsFormat, setDdsFormat] = useState<DdsFormat>(DEFAULT_DDS_FORMAT);
  const [detectedFormat, setDetectedFormat] = useState<string | null>(null);
  const [formatLoading, setFormatLoading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [modalConstraints, setModalConstraints] = useState(getTexturePreviewModalDimensions);
  const [size, setSize] = useState(() => {
    const dims = getTexturePreviewModalDimensions();
    return resolveSceneEditRndInitialSize(SCENE_EDIT_RND_SIZE_KEYS.texturePreview, dims);
  });
  const [position, setPosition] = useState(() => {
    const dims = getTexturePreviewModalDimensions();
    const initialSize = resolveSceneEditRndInitialSize(
      SCENE_EDIT_RND_SIZE_KEYS.texturePreview,
      dims,
    );
    return getCenteredModalPosition(initialSize);
  });

  useEffect(() => {
    const onResize = () => {
      const dims = getTexturePreviewModalDimensions();
      setModalConstraints(dims);
      setSize((prev) => clampRndSizeToConstraints(prev, dims));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleResizeStop = useCallback(
    (...args: Parameters<NonNullable<ComponentProps<typeof Rnd>["onResizeStop"]>>) => {
      const ref = args[2];
      const nextPosition = args[4];
      const dims = getTexturePreviewModalDimensions();
      const nextSize = persistSceneEditRndSize(
        SCENE_EDIT_RND_SIZE_KEYS.texturePreview,
        { width: ref.offsetWidth, height: ref.offsetHeight },
        dims,
      );
      setModalConstraints(dims);
      setSize(nextSize);
      setPosition(nextPosition);
    },
    [],
  );

  const loadedData = entry.nutexbPath
    ? lookupSceneTextureData(textureDataMap, entry.nutexbPath)
    : null;
  const loadedRgba = extractRgbaFromTextureData(loadedData);

  useEffect(() => {
    if (!entry.nutexbPath) {
      setLoading(false);
      setError("No nutexb path available");
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
          setError("Failed to load preview");
          return;
        }
        setPreviewDataUrl(dataUrl);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(typeof err === "string" ? err : "Failed to load preview");
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

  const content = (
    <div
      id={PREVIEW_MODAL_ID}
      className="fixed inset-x-0 bottom-0 top-[var(--layout-topbar-height)] z-[var(--z-modal)] pointer-events-none"
    >
      <Rnd
        size={size}
        position={position}
        minWidth={modalConstraints.minWidth}
        minHeight={modalConstraints.minHeight}
        maxWidth={modalConstraints.maxWidth}
        maxHeight={modalConstraints.maxHeight}
        dragHandleClassName="texture-preview-drag-handle"
        cancel="button, input, textarea, select, label, a, [data-no-drag]"
        bounds="window"
        className="pointer-events-auto"
        style={{ zIndex: 60 }}
        onDragStop={(_event, data) => setPosition({ x: data.x, y: data.y })}
        onResizeStop={handleResizeStop}
      >
        <div className="flex flex-col h-full bg-background border border-border rounded-lg shadow-xl overflow-hidden">
          <div className="texture-preview-drag-handle flex items-center justify-between px-3 py-1.5 bg-muted/40 border-b cursor-move select-none shrink-0">
            <span className="text-xs font-medium truncate mr-2">
              {entry.filename}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              {previewWidth > 0 && previewHeight > 0 && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  {previewWidth}×{previewHeight}
                </span>
              )}
              <span className="w-9 text-right font-mono text-[10px] text-muted-foreground">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                data-no-drag
                title="Zoom out"
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
                title="Reset zoom"
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
                title="Zoom in"
                onClick={() => adjustZoom(1)}
                disabled={isReencoding || !previewDataUrl || zoom >= MAX_ZOOM}
              >
                <ZoomIn className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                data-no-drag
                onClick={onClose}
                disabled={isReencoding}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>

          <div
            className="flex flex-1 items-center justify-center bg-[repeating-conic-gradient(#80808020_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] overflow-auto p-2 min-h-0"
            data-no-drag
            onWheel={handlePreviewWheel}
          >
            {loading && (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-xs">Loading preview...</span>
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
                DDS Format
              </label>
              <TextureFormatSelect
                value={ddsFormat}
                onChange={setDdsFormat}
                disabled={formatLoading || isReencoding}
                triggerClassName="h-7 text-xs w-full"
              />
              <div className="text-[10px] text-muted-foreground min-h-4 leading-snug">
                {formatLoading
                  ? "Detecting original format from target nutexb..."
                  : "Default is the original format from the target nutexb file."}
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
                    Re-encoding...
                  </>
                ) : (
                  "Apply format to nutexb"
                )}
              </Button>
            )}
          </div>
        </div>
      </Rnd>
    </div>
  );

  return createPortal(content, document.body);
}
