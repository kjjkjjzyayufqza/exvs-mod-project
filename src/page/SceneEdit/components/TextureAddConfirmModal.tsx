import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ImageIcon, Images, Loader2 } from "lucide-react";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { TextureFormatSelect, type DdsFormat } from "./TextureFormatSelect";
import { DEFAULT_DDS_FORMAT } from "../utils/sceneTextureDdsFormat";
import { isImageFile } from "@/page/TestEditor/components/ImagePreview";
import { SCENE_EDIT_RND_SIZE_KEYS } from "./sceneEditRndSizePersistence";
import {
  describeDuplicate,
  isReplaceableDuplicate,
  type AnalyzedAddCandidate,
} from "../utils/sceneTextureAddPlan";

const TEXTURE_ADD_MODAL_DIMENSIONS = {
  width: 560,
  height: 620,
  minWidth: 420,
  minHeight: 360,
};
const CANDIDATE_ROW_HEIGHT = 52;

export interface TextureAddSelection {
  candidate: AnalyzedAddCandidate;
  ddsFormat: DdsFormat;
  /** When true, overwrite the existing texture that this candidate collides with. */
  replace: boolean;
}

interface TextureAddConfirmModalProps {
  candidates: AnalyzedAddCandidate[];
  /** True while duplicate analysis (internal-name reads) is still running. */
  analyzing: boolean;
  isConverting?: boolean;
  convertProgress?: { done: number; total: number } | null;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  onConfirm: (selections: TextureAddSelection[]) => void;
}

export function TextureAddConfirmModal({
  candidates,
  analyzing,
  isConverting = false,
  convertProgress = null,
  title,
  subtitle,
  onClose,
  onConfirm,
}: TextureAddConfirmModalProps) {
  const { t } = useTranslation("scene-texture-dialogs");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [formats, setFormats] = useState<Record<string, DdsFormat>>({});
  const [bulkFormat, setBulkFormat] = useState<DdsFormat>(DEFAULT_DDS_FORMAT);
  const candidateListRef = useRef<HTMLDivElement | null>(null);

  // Keep per-row selection in sync with the candidate list.
  // - Unique rows: default checked; preserve prior choice when analysis updates.
  // - Replaceable duplicates: checkbox enabled but default unchecked (opt-in replace).
  // - Batch-internal duplicates: never selectable.
  useEffect(() => {
    setChecked((prev) => {
      const next: Record<string, boolean> = {};
      for (const candidate of candidates) {
        if (candidate.duplicate && !isReplaceableDuplicate(candidate)) {
          next[candidate.id] = false;
        } else if (isReplaceableDuplicate(candidate)) {
          next[candidate.id] = prev[candidate.id] ?? false;
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

  /** Rows the master checkbox toggles — unique adds only (never mass-replace). */
  const masterToggleIds = useMemo(
    () => candidates.filter((c) => !c.duplicate).map((c) => c.id),
    [candidates],
  );
  const selectableIds = useMemo(
    () =>
      candidates
        .filter((c) => !c.duplicate || isReplaceableDuplicate(c))
        .map((c) => c.id),
    [candidates],
  );
  const imageIds = useMemo(
    () =>
      candidates
        .filter((c) => (!c.duplicate || isReplaceableDuplicate(c)) && !c.isNutexb)
        .map((c) => c.id),
    [candidates],
  );
  const replaceableCount = useMemo(
    () => candidates.filter((c) => isReplaceableDuplicate(c)).length,
    [candidates],
  );
  const selectedCount = useMemo(
    () => selectableIds.filter((id) => checked[id]).length,
    [selectableIds, checked],
  );
  const selectedReplaceCount = useMemo(
    () =>
      candidates.filter((c) => isReplaceableDuplicate(c) && checked[c.id]).length,
    [candidates, checked],
  );
  const selectedAddCount = selectedCount - selectedReplaceCount;

  const masterState: boolean | "indeterminate" = useMemo(() => {
    const masterSelected = masterToggleIds.filter((id) => checked[id]).length;
    if (masterToggleIds.length === 0 || masterSelected === 0) return false;
    if (masterSelected === masterToggleIds.length) return true;
    return "indeterminate";
  }, [masterToggleIds, checked]);

  const busy = analyzing || isConverting;
  const getCandidateListScrollElement = useCallback(() => candidateListRef.current, []);
  const candidateVirtualizer = useVirtualizer({
    count: candidates.length,
    getScrollElement: getCandidateListScrollElement,
    getItemKey: (index) => candidates[index]?.id ?? index,
    estimateSize: () => CANDIDATE_ROW_HEIGHT,
    overscan: 8,
  });

  const toggleAll = useCallback(
    (value: boolean) => {
      setChecked((prev) => {
        const next = { ...prev };
        for (const id of masterToggleIds) next[id] = value;
        return next;
      });
    },
    [masterToggleIds],
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
      .filter((c) => checked[c.id] && (!c.duplicate || isReplaceableDuplicate(c)))
      .map((c) => ({
        candidate: c,
        ddsFormat: formats[c.id] ?? DEFAULT_DDS_FORMAT,
        replace: isReplaceableDuplicate(c),
      }));
    if (selections.length === 0) return;
    onConfirm(selections);
  }, [candidates, checked, formats, onConfirm]);

  const footerSummary = useMemo(() => {
    if (analyzing) return t("add.checkingDuplicates");
    const parts: string[] = [];
    if (selectedAddCount > 0) parts.push(t("add.summaryAdd", { count: selectedAddCount }));
    if (selectedReplaceCount > 0) parts.push(t("add.summaryReplace", { count: selectedReplaceCount }));
    if (parts.length > 0) return parts.join(" · ");
    if (replaceableCount > 0) {
      return t("add.conflicts", { count: replaceableCount });
    }
    return t("add.noDuplicates");
  }, [analyzing, selectedAddCount, selectedReplaceCount, replaceableCount, t]);

  const footer = (
    <div className="flex items-center gap-2 bg-muted/20 px-3 py-2">
      <span className="mr-auto text-[10px] text-muted-foreground">{footerSummary}</span>
      <Button
        variant="outline"
        size="sm"
        className="text-xs"
        onClick={onClose}
        disabled={isConverting}
      >
        {t("common.cancel")}
      </Button>
      <Button
        size="sm"
        className="min-w-[150px] text-xs"
        onClick={handleConfirm}
        disabled={busy || selectedCount === 0}
      >
        {isConverting ? (
          <>
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            {convertProgress
              ? t("add.convertingProgress", convertProgress)
              : t("add.converting")}
          </>
        ) : selectedReplaceCount > 0 && selectedAddCount === 0 ? (
          t("add.confirmReplace", { count: selectedReplaceCount })
        ) : selectedReplaceCount > 0 ? (
          t("add.confirmMixed", { add: selectedAddCount, replace: selectedReplaceCount })
        ) : (
          t("add.confirmConvert", { count: selectedCount })
        )}
      </Button>
    </div>
  );

  const content = (
    <AppRndModalShell
      titleId="texture-add-confirm-modal-title"
      title={title ?? t("add.title", { count: candidates.length })}
      subtitle={subtitle ?? t("add.subtitle")}
      headerIcon={<Images className="h-4 w-4 text-primary" />}
      dimensions={TEXTURE_ADD_MODAL_DIMENSIONS}
      storageKey={SCENE_EDIT_RND_SIZE_KEYS.textureAddConfirm}
      onClose={onClose}
      closeDisabled={isConverting}
      footer={footer}
    >
          {/* Bulk toolbar */}
          <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20 shrink-0">
            <label className="flex items-center gap-1.5 text-[11px] select-none cursor-pointer">
              <Checkbox
                checked={masterState}
                disabled={busy || masterToggleIds.length === 0}
                onCheckedChange={(value) => toggleAll(value === true)}
                title={t("add.toggleAll")}
              />
              <span>
                {t("add.selected", { selected: selectedCount, total: selectableIds.length })}
                {selectedReplaceCount > 0 ? ` (${t("add.replaceCount", { count: selectedReplaceCount })})` : ""}
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
                title={t("add.applyChecked")}
              >
                {t("add.toSelected")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] px-2"
                disabled={busy || imageIds.length === 0}
                onClick={() => applyFormatTo(imageIds)}
                title={t("add.applyAll")}
              >
                {t("add.toAll")}
              </Button>
            </div>
          </div>

          {/* Candidate list */}
          <div ref={candidateListRef} className="min-h-0 flex-1 overflow-auto overscroll-contain">
            <div className="relative w-full" style={{ height: candidateVirtualizer.getTotalSize() }}>
              {candidateVirtualizer.getVirtualItems().map((virtualRow) => {
                const candidate = candidates[virtualRow.index];
                if (!candidate) return null;
                return (
                  <div
                    key={candidate.id}
                    className="absolute left-0 top-0 w-full"
                    style={{
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <CandidateRow
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
                  </div>
                );
              })}
            </div>
          </div>
    </AppRndModalShell>
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
  const { t } = useTranslation("scene-texture-dialogs");
  const [previewError, setPreviewError] = useState(false);
  const previewSrc = useMemo(() => {
    if (candidate.isNutexb || !isImageFile(candidate.filename)) return null;
    return convertFileSrc(candidate.sourcePath);
  }, [candidate.filename, candidate.isNutexb, candidate.sourcePath]);

  const replaceable = isReplaceableDuplicate(candidate);
  const blockedDuplicate = candidate.duplicate && !replaceable;
  const rowSelectable = !candidate.duplicate || replaceable;
  const willReplace = replaceable && checked;

  return (
    <div
      className={cn(
        "flex h-full items-center gap-2 border-b border-border/30 px-3 py-1.5",
        blockedDuplicate
          ? "bg-destructive/5 opacity-70"
          : willReplace
            ? "bg-amber-500/10"
            : replaceable
              ? "bg-destructive/5"
              : "hover:bg-muted/30",
      )}
    >
      <Checkbox
        checked={checked}
        disabled={disabled || !rowSelectable}
        onCheckedChange={(value) => onToggle(value === true)}
        title={
          replaceable
              ? t("add.checkToReplace")
            : blockedDuplicate
              ? describeDuplicate(candidate)
              : undefined
        }
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
          {willReplace ? (
            <span className="ml-1 text-[10px] font-medium text-amber-700 dark:text-amber-400">
              {t("add.replaceLabel")}
            </span>
          ) : null}
        </span>
        {candidate.duplicate ? (
          <span
            className={cn(
              "flex items-center gap-1 text-[10px] leading-tight",
              willReplace ? "text-amber-700 dark:text-amber-400" : "text-destructive",
            )}
          >
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
            {willReplace ? t("add.overwriteAsIs") : t("add.copyAsIs")}
          </span>
        ) : (
          <TextureFormatSelect
            value={format}
            onChange={onFormatChange}
            disabled={disabled || !rowSelectable || (replaceable && !checked)}
            triggerClassName="h-7 text-[11px] w-full"
          />
        )}
      </div>
    </div>
  );
}
