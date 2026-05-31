import { useCallback, useEffect, useMemo, useState, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Rnd } from "react-rnd";
import { AlertTriangle, ImageIcon, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { TextureFormatSelect, type DdsFormat } from "./TextureFormatSelect";
import { DEFAULT_DDS_FORMAT } from "../utils/sceneTextureDdsFormat";
import { isImageFile } from "@/page/TestEditor/components/ImagePreview";
import { clampRndSizeToConstraints } from "./sceneEditRndModalUtils";
import {
  SCENE_EDIT_RND_SIZE_KEYS,
  persistSceneEditRndSize,
  resolveSceneEditRndInitialSize,
} from "./sceneEditRndSizePersistence";
import {
  describeDuplicate,
  type AnalyzedAddCandidate,
} from "../utils/sceneTextureAddPlan";

const VIEWPORT_MARGIN = 32;

export interface TextureAddSelection {
  candidate: AnalyzedAddCandidate;
  ddsFormat: DdsFormat;
}

function getViewportSize() {
  if (typeof window === "undefined") return { width: 1280, height: 800 };
  return { width: window.innerWidth, height: window.innerHeight };
}

function getTextureAddConfirmModalDimensions() {
  const { width: vw, height: vh } = getViewportSize();
  const width = Math.min(560, vw - VIEWPORT_MARGIN * 2);
  const height = Math.min(620, vh - VIEWPORT_MARGIN * 2);
  return {
    width,
    height,
    minWidth: 420,
    minHeight: 360,
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

interface TextureAddConfirmModalProps {
  candidates: AnalyzedAddCandidate[];
  /** True while duplicate analysis (internal-name reads) is still running. */
  analyzing: boolean;
  isConverting?: boolean;
  convertProgress?: { done: number; total: number } | null;
  onClose: () => void;
  onConfirm: (selections: TextureAddSelection[]) => void;
}

export function TextureAddConfirmModal({
  candidates,
  analyzing,
  isConverting = false,
  convertProgress = null,
  onClose,
  onConfirm,
}: TextureAddConfirmModalProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [formats, setFormats] = useState<Record<string, DdsFormat>>({});
  const [bulkFormat, setBulkFormat] = useState<DdsFormat>(DEFAULT_DDS_FORMAT);

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

  // Keep per-row selection in sync with the candidate list. Duplicates can never
  // be checked; non-duplicate rows default to checked and preserve prior choices
  // (so the row stays selected when analysis flips an unrelated row).
  useEffect(() => {
    setChecked((prev) => {
      const next: Record<string, boolean> = {};
      for (const candidate of candidates) {
        if (candidate.duplicate) {
          next[candidate.id] = false;
        } else {
          next[candidate.id] = prev[candidate.id] ?? true;
        }
      }
      return next;
    });
    setFormats((prev) => {
      const next: Record<string, DdsFormat> = {};
      for (const candidate of candidates) {
        next[candidate.id] = prev[candidate.id] ?? DEFAULT_DDS_FORMAT;
      }
      return next;
    });
  }, [candidates]);

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

  const selectableIds = useMemo(
    () => candidates.filter((c) => !c.duplicate).map((c) => c.id),
    [candidates],
  );
  const imageIds = useMemo(
    () => candidates.filter((c) => !c.duplicate && !c.isNutexb).map((c) => c.id),
    [candidates],
  );
  const duplicateCount = candidates.length - selectableIds.length;
  const selectedCount = useMemo(
    () => selectableIds.filter((id) => checked[id]).length,
    [selectableIds, checked],
  );

  const masterState: boolean | "indeterminate" = useMemo(() => {
    if (selectableIds.length === 0 || selectedCount === 0) return false;
    if (selectedCount === selectableIds.length) return true;
    return "indeterminate";
  }, [selectableIds.length, selectedCount]);

  const busy = analyzing || isConverting;

  const toggleAll = useCallback(
    (value: boolean) => {
      setChecked((prev) => {
        const next = { ...prev };
        for (const id of selectableIds) next[id] = value;
        return next;
      });
    },
    [selectableIds],
  );

  const applyFormatTo = useCallback(
    (ids: string[]) => {
      setFormats((prev) => {
        const next = { ...prev };
        for (const id of ids) next[id] = bulkFormat;
        return next;
      });
    },
    [bulkFormat],
  );

  const handleConfirm = useCallback(() => {
    const selections: TextureAddSelection[] = candidates
      .filter((c) => !c.duplicate && checked[c.id])
      .map((c) => ({ candidate: c, ddsFormat: formats[c.id] ?? DEFAULT_DDS_FORMAT }));
    if (selections.length === 0) return;
    onConfirm(selections);
  }, [candidates, checked, formats, onConfirm]);

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
              Add textures ({candidates.length})
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

          {/* Bulk toolbar */}
          <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20 shrink-0">
            <label className="flex items-center gap-1.5 text-[11px] select-none cursor-pointer">
              <Checkbox
                checked={masterState}
                disabled={busy || selectableIds.length === 0}
                onCheckedChange={(value) => toggleAll(value === true)}
              />
              <span>
                {selectedCount}/{selectableIds.length} selected
              </span>
            </label>

            <div className="flex items-center gap-1 ml-auto" data-no-drag>
              <TextureFormatSelect
                value={bulkFormat}
                onChange={setBulkFormat}
                disabled={busy || imageIds.length === 0}
                triggerClassName="h-7 text-[11px] w-[150px]"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] px-2"
                disabled={busy || imageIds.length === 0}
                onClick={() => applyFormatTo(imageIds.filter((id) => checked[id]))}
                title="Apply this format to the checked image rows"
              >
                To selected
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] px-2"
                disabled={busy || imageIds.length === 0}
                onClick={() => applyFormatTo(imageIds)}
                title="Apply this format to every image row"
              >
                To all
              </Button>
            </div>
          </div>

          {/* Candidate list */}
          <div className="flex-1 min-h-0 overflow-auto">
            {candidates.map((candidate) => (
              <CandidateRow
                key={candidate.id}
                candidate={candidate}
                checked={!!checked[candidate.id]}
                format={formats[candidate.id] ?? DEFAULT_DDS_FORMAT}
                disabled={busy}
                onToggle={(value) =>
                  setChecked((prev) => ({ ...prev, [candidate.id]: value }))
                }
                onFormatChange={(value) =>
                  setFormats((prev) => ({ ...prev, [candidate.id]: value }))
                }
              />
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2 px-3 py-2 border-t bg-muted/20 shrink-0">
            <span className="text-[10px] text-muted-foreground mr-auto">
              {analyzing
                ? "Checking for duplicate names..."
                : duplicateCount > 0
                  ? `${duplicateCount} duplicate(s) skipped`
                  : "No duplicates"}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={onClose}
              disabled={isConverting}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="text-xs min-w-[150px]"
              onClick={handleConfirm}
              disabled={busy || selectedCount === 0}
            >
              {isConverting ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  {convertProgress
                    ? `Converting ${convertProgress.done}/${convertProgress.total}...`
                    : "Converting..."}
                </>
              ) : (
                `Confirm & Convert (${selectedCount})`
              )}
            </Button>
          </div>
        </div>
      </Rnd>
    </div>
  );

  return createPortal(content, document.body);
}

interface CandidateRowProps {
  candidate: AnalyzedAddCandidate;
  checked: boolean;
  format: DdsFormat;
  disabled: boolean;
  onToggle: (value: boolean) => void;
  onFormatChange: (value: DdsFormat) => void;
}

function CandidateRow({
  candidate,
  checked,
  format,
  disabled,
  onToggle,
  onFormatChange,
}: CandidateRowProps) {
  const [previewError, setPreviewError] = useState(false);
  const previewSrc = useMemo(() => {
    if (candidate.isNutexb || !isImageFile(candidate.filename)) return null;
    return convertFileSrc(candidate.sourcePath);
  }, [candidate.filename, candidate.isNutexb, candidate.sourcePath]);

  const isDuplicate = candidate.duplicate;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 border-b border-border/30",
        isDuplicate ? "bg-destructive/5 opacity-70" : "hover:bg-muted/30",
      )}
    >
      <Checkbox
        checked={checked}
        disabled={disabled || isDuplicate}
        onCheckedChange={(value) => onToggle(value === true)}
        title={isDuplicate ? describeDuplicate(candidate) : undefined}
      />

      <div className="w-9 h-9 shrink-0 rounded bg-muted/50 flex items-center justify-center overflow-hidden">
        {previewSrc && !previewError ? (
          <img
            src={previewSrc}
            alt={candidate.filename}
            className="w-full h-full object-cover"
            draggable={false}
            onError={() => setPreviewError(true)}
          />
        ) : (
          <ImageIcon className="h-4 w-4 text-muted-foreground/50" />
        )}
      </div>

      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[11px] truncate leading-tight" title={candidate.filename}>
          {candidate.filename}
        </span>
        {isDuplicate ? (
          <span className="flex items-center gap-1 text-[10px] text-destructive leading-tight">
            <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{describeDuplicate(candidate)}</span>
          </span>
        ) : (
          <span
            className="text-[10px] text-muted-foreground font-mono truncate leading-tight"
            title={candidate.nutexbFilename}
          >
            → {candidate.nutexbFilename}
          </span>
        )}
      </div>

      <div className="shrink-0 w-[150px]" data-no-drag>
        {candidate.isNutexb ? (
          <span className="text-[10px] text-muted-foreground italic block text-right pr-1">
            copy as-is
          </span>
        ) : (
          <TextureFormatSelect
            value={format}
            onChange={onFormatChange}
            disabled={disabled || isDuplicate}
            triggerClassName="h-7 text-[11px] w-full"
          />
        )}
      </div>
    </div>
  );
}
