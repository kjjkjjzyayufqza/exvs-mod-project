import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Rnd } from "react-rnd";
import { X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TextureManagerEntry } from "../store/sceneTextureManagerStore";
import type { NutexbTextureDataMap } from "../hooks/useSceneTextureLoader";
import type { SceneTextureDecodeContext } from "../utils/sceneTextureDecode";
import {
  extractRgbaFromTextureData,
  lookupSceneTextureData,
  resolveSceneTexturePreviewDataUrl,
} from "../utils/sceneTextureThumbnail";

const VIEWPORT_MARGIN = 32;
const PREVIEW_MODAL_ID = "texture-preview-modal-layer";

function getViewportSize() {
  if (typeof window === "undefined") return { width: 1280, height: 800 };
  return { width: window.innerWidth, height: window.innerHeight };
}

interface TexturePreviewModalProps {
  entry: TextureManagerEntry;
  textureDataMap: NutexbTextureDataMap;
  decodeContext: SceneTextureDecodeContext;
  onClose: () => void;
}

export function TexturePreviewModal({
  entry,
  textureDataMap,
  decodeContext,
  onClose,
}: TexturePreviewModalProps) {
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const { width: vw, height: vh } = getViewportSize();
  const modalWidth = Math.min(560, vw - VIEWPORT_MARGIN * 2);
  const modalHeight = Math.min(480, vh - VIEWPORT_MARGIN * 2);

  const previewWidth = loadedRgba?.width ?? entry.width;
  const previewHeight = loadedRgba?.height ?? entry.height;

  const content = (
    <div
      id={PREVIEW_MODAL_ID}
      className="fixed inset-0 z-50 pointer-events-none"
    >
      <Rnd
        default={{
          x: Math.round((vw - modalWidth) / 2),
          y: Math.round((vh - modalHeight) / 2),
          width: modalWidth,
          height: modalHeight,
        }}
        minWidth={280}
        minHeight={220}
        maxWidth={vw - VIEWPORT_MARGIN}
        maxHeight={vh - VIEWPORT_MARGIN}
        dragHandleClassName="texture-preview-drag-handle"
        bounds="window"
        className="pointer-events-auto"
        style={{ zIndex: 60 }}
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
              {entry.format !== "unknown" && entry.format !== "pending" && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  {entry.format}
                </span>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={onClose}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>

          <div className="flex flex-1 items-center justify-center bg-[repeating-conic-gradient(#80808020_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] overflow-auto p-2">
            {loading && (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-xs">Loading preview...</span>
              </div>
            )}
            {error && (
              <span className="text-xs text-destructive">{error}</span>
            )}
            {previewDataUrl && (
              <img
                src={previewDataUrl}
                alt={entry.filename}
                className="max-w-full max-h-full object-contain"
                draggable={false}
              />
            )}
          </div>
        </div>
      </Rnd>
    </div>
  );

  return createPortal(content, document.body);
}
