import { useCallback, useEffect, useMemo, useState, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Rnd } from "react-rnd";
import { ImageIcon, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextureFormatSelect, type DdsFormat } from "./TextureFormatSelect";
import { DEFAULT_DDS_FORMAT } from "../utils/sceneTextureDdsFormat";
import { isImageFile } from "@/page/TestEditor/components/ImagePreview";
import { clampRndSizeToConstraints } from "./sceneEditRndModalUtils";
import {
  SCENE_EDIT_RND_SIZE_KEYS,
  persistSceneEditRndSize,
  resolveSceneEditRndInitialSize,
} from "./sceneEditRndSizePersistence";

const VIEWPORT_MARGIN = 32;

function getViewportSize() {
  if (typeof window === "undefined") return { width: 1280, height: 800 };
  return { width: window.innerWidth, height: window.innerHeight };
}

function getTextureAddConfirmModalDimensions() {
  const { width: vw, height: vh } = getViewportSize();
  const width = Math.min(420, vw - VIEWPORT_MARGIN * 2);
  const height = Math.min(440, vh - VIEWPORT_MARGIN * 2);
  return {
    width,
    height,
    minWidth: 300,
    minHeight: 280,
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

export interface TextureAddConfirmPayload {
  sourcePath: string;
  filename: string;
  nutexbFilename: string;
}

interface TextureAddConfirmModalProps {
  payload: TextureAddConfirmPayload;
  onClose: () => void;
  onConfirm: (ddsFormat: DdsFormat) => void;
  isConverting?: boolean;
}

export function TextureAddConfirmModal({
  payload,
  onClose,
  onConfirm,
  isConverting = false,
}: TextureAddConfirmModalProps) {
  const [ddsFormat, setDdsFormat] = useState<DdsFormat>(DEFAULT_DDS_FORMAT);
  const [previewError, setPreviewError] = useState(false);
  const [modalConstraints, setModalConstraints] = useState(getTextureAddConfirmModalDimensions);
  const [size, setSize] = useState(() => {
    const dims = getTextureAddConfirmModalDimensions();
    return resolveSceneEditRndInitialSize(SCENE_EDIT_RND_SIZE_KEYS.textureAddConfirm, dims);
  });
  const [position, setPosition] = useState(() => {
    const dims = getTextureAddConfirmModalDimensions();
    const initialSize = resolveSceneEditRndInitialSize(
      SCENE_EDIT_RND_SIZE_KEYS.textureAddConfirm,
      dims,
    );
    return getCenteredModalPosition(initialSize);
  });

  useEffect(() => {
    const onResize = () => {
      const dims = getTextureAddConfirmModalDimensions();
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
      const dims = getTextureAddConfirmModalDimensions();
      const nextSize = persistSceneEditRndSize(
        SCENE_EDIT_RND_SIZE_KEYS.textureAddConfirm,
        { width: ref.offsetWidth, height: ref.offsetHeight },
        dims,
      );
      setModalConstraints(dims);
      setSize(nextSize);
      setPosition(nextPosition);
    },
    [],
  );

  const previewSrc = useMemo(() => {
    if (!isImageFile(payload.filename)) return null;
    return convertFileSrc(payload.sourcePath);
  }, [payload.filename, payload.sourcePath]);

  const content = (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <Rnd
        size={size}
        position={position}
        minWidth={modalConstraints.minWidth}
        minHeight={modalConstraints.minHeight}
        maxWidth={modalConstraints.maxWidth}
        maxHeight={modalConstraints.maxHeight}
        dragHandleClassName="texture-add-confirm-drag-handle"
        cancel="button, input, textarea, select, label, a, [data-no-drag]"
        bounds="window"
        className="pointer-events-auto"
        style={{ zIndex: 60 }}
        onDragStop={(_event, data) => setPosition({ x: data.x, y: data.y })}
        onResizeStop={handleResizeStop}
      >
        <div className="flex flex-col h-full bg-background border border-border rounded-lg shadow-xl overflow-hidden">
          <div className="texture-add-confirm-drag-handle flex items-center justify-between px-3 py-1.5 bg-muted/40 border-b cursor-move select-none shrink-0">
            <span className="text-xs font-medium truncate mr-2">
              Add texture preview
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              data-no-drag
              onClick={onClose}
              disabled={isConverting}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>

          <div className="flex flex-col gap-3 p-3 flex-1 min-h-0">
            <div className="flex flex-1 min-h-[140px] items-center justify-center rounded border bg-[repeating-conic-gradient(#80808020_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] overflow-hidden">
              {previewSrc && !previewError ? (
                <img
                  src={previewSrc}
                  alt={payload.filename}
                  className="max-w-full max-h-full object-contain"
                  draggable={false}
                  onError={() => setPreviewError(true)}
                />
              ) : (
                <div className="flex flex-col items-center gap-1 text-muted-foreground px-2 text-center">
                  <ImageIcon className="h-6 w-6 opacity-50" />
                  <span className="text-[10px] break-all">{payload.filename}</span>
                  {previewError && (
                    <span className="text-[10px] text-destructive">
                      Preview unavailable for this file type
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1 shrink-0">
              <span className="text-[10px] text-muted-foreground">Output</span>
              <span className="text-xs font-mono truncate" title={payload.nutexbFilename}>
                {payload.nutexbFilename}
              </span>
            </div>

            <div className="flex flex-col gap-1 shrink-0">
              <label className="text-xs text-muted-foreground">
                DDS format for conversion
              </label>
              <TextureFormatSelect
                value={ddsFormat}
                onChange={setDdsFormat}
                disabled={isConverting}
                triggerClassName="h-8 text-xs w-full"
              />
            </div>

            <div className="flex items-center gap-2 mt-auto shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs"
                onClick={onClose}
                disabled={isConverting}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="flex-1 text-xs"
                onClick={() => onConfirm(ddsFormat)}
                disabled={isConverting}
              >
                {isConverting ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    Converting...
                  </>
                ) : (
                  "Confirm & Convert"
                )}
              </Button>
            </div>
          </div>
        </div>
      </Rnd>
    </div>
  );

  return createPortal(content, document.body);
}
