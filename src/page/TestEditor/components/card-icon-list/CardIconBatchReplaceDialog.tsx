import { useCallback, useDeferredValue, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { useVirtualizer } from "@tanstack/react-virtual";
import { toast } from "sonner";
import { Images, Loader2, Search } from "lucide-react";

import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { DDS_FORMATS } from "@/lib/ddsFormats";
import { splitPathSegments } from "@/lib/fhm2d_fileUrlUtils";
import type { CardIconItem } from "./cardIconStructure";
import { useTranslation } from "react-i18next";

type ReplacePixelSource = "nutexb" | "convertPng";
const BATCH_REPLACE_ROW_HEIGHT = 36;
const CARD_ICON_BATCH_REPLACE_MODAL_DIMENSIONS = {
  width: 620,
  height: 760,
  minWidth: 520,
  minHeight: 560,
};

function resolveFullPath(folderPath: string, fileUrl: string): Promise<string> {
  const segments = splitPathSegments(fileUrl);
  if (segments.length === 0) return Promise.resolve("");
  return join(folderPath, ...segments);
}

interface CardIconBatchReplaceDialogProps {
  folderPath: string;
  convertDirPath: string;
  items: CardIconItem[];
  onApplied: () => Promise<void> | void;
  triggerLabel?: string;
  disabled?: boolean;
}

export function CardIconBatchReplaceDialog({
  folderPath,
  convertDirPath,
  items,
  onApplied,
  triggerLabel,
  disabled = false,
}: CardIconBatchReplaceDialogProps) {
  const { t } = useTranslation("test-lists");
  const resolvedTriggerLabel = triggerLabel ?? t("nutexb.replaceFormat");
  const [openState, setOpenState] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [ddsFormat, setDdsFormat] = useState<string>("BC7RgbaUnormSrgb");
  const [pixelSource, setPixelSource] = useState<ReplacePixelSource>("nutexb");
  const [isReplacing, setIsReplacing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [replaceProgress, setReplaceProgress] = useState<{
    current: number;
    total: number;
    currentFileName: string;
  } | null>(null);

  const lastAnchorFilteredIndexRef = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const deferredSearchTerm = useDeferredValue(searchTerm);

  const itemsWithFileUrl = useMemo(
    () => items.filter((it) => it.fileUrl && (it.fileIndex !== null || it.name)),
    [items]
  );

  const filteredItems = useMemo(() => {
    const term = deferredSearchTerm.trim().toLowerCase();
    if (!term) return itemsWithFileUrl;
    return itemsWithFileUrl.filter((item) => {
      const name = item.name ?? "";
      return (
        name.toLowerCase().includes(term) ||
        item.itemIndex.toString().includes(term) ||
        (item.fileIndex !== null && item.fileIndex.toString().includes(term))
      );
    });
  }, [itemsWithFileUrl, deferredSearchTerm]);
  const getListScrollElement = useCallback(() => listRef.current, []);
  const rowVirtualizer = useVirtualizer({
    count: filteredItems.length,
    getScrollElement: getListScrollElement,
    estimateSize: () => BATCH_REPLACE_ROW_HEIGHT,
    overscan: 10,
  });

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredItems.map((it) => it.itemIndex)));
  }, [filteredItems]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const toggleItem = useCallback((itemIndex: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemIndex)) {
        next.delete(itemIndex);
      } else {
        next.add(itemIndex);
      }
      return next;
    });
  }, []);

  const selectFilteredIndexRange = useCallback(
    (start: number, end: number) => {
      const lo = Math.min(start, end);
      const hi = Math.max(start, end);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (let i = lo; i <= hi; i++) {
          const it = filteredItems[i];
          if (it) next.add(it.itemIndex);
        }
        return next;
      });
    },
    [filteredItems]
  );

  const handleListRowMouseDownCapture = useCallback(
    (e: React.MouseEvent, filteredIndex: number, itemIndex: number) => {
      if (isReplacing || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      if (e.shiftKey && lastAnchorFilteredIndexRef.current !== null) {
        selectFilteredIndexRange(lastAnchorFilteredIndexRef.current, filteredIndex);
        return;
      }

      toggleItem(itemIndex);
      lastAnchorFilteredIndexRef.current = filteredIndex;
    },
    [isReplacing, selectFilteredIndexRange, toggleItem]
  );

  const handleCheckboxCheckedChange = useCallback(
    (filteredIndex: number, itemIndex: number) => {
      if (isReplacing) return;
      toggleItem(itemIndex);
      lastAnchorFilteredIndexRef.current = filteredIndex;
    },
    [isReplacing, toggleItem]
  );

  const handleReplace = useCallback(async () => {
    if (selectedIds.size === 0) {
      toast.error(t("cardIcon.selectOneImage"));
      return;
    }
    if (!folderPath || !convertDirPath) {
      toast.error(t("cardIcon.folderOrConvertMissing"));
      return;
    }

    const toProcess = itemsWithFileUrl.filter((it) => selectedIds.has(it.itemIndex));
    if (toProcess.length === 0) {
      toast.error(t("cardIcon.noValidItems"));
      return;
    }

    const pairs: [string, string][] = [];
    for (const it of toProcess) {
      const url = it.fileUrl ?? "";
      if (!url) continue;
      const nutexbPath = await resolveFullPath(folderPath, url);
      if (!nutexbPath) continue;
      pairs.push([nutexbPath, convertDirPath]);
    }

    if (pairs.length === 0) {
      toast.error(t("cardIcon.resolvePathsFailed"));
      return;
    }

    try {
      setIsReplacing(true);
      setReplaceProgress({ current: 0, total: pairs.length, currentFileName: "" });

      let converted = 0;
      let failed = 0;

      for (let i = 0; i < pairs.length; i++) {
        const [nutexbPath] = pairs[i];
        const fileName = nutexbPath.split(/[/\\]/).pop() ?? nutexbPath;
        setReplaceProgress({
          current: i + 1,
          total: pairs.length,
          currentFileName: fileName,
        });

        const result = await invoke<{ converted: number; failed: number }>(
          "card_icon_batch_replace_with_dds_format",
          { items: [pairs[i]], ddsFormat, source: pixelSource }
        );
        converted += result.converted;
        failed += result.failed;
      }

      setReplaceProgress(null);
      toast.success(t("cardIcon.replacedCount", { count: converted, format: ddsFormat }));
      if (failed > 0) {
        toast.error(t("cardIcon.replaceFailedCount", { count: failed }));
      }
      setOpenState(false);
      setSelectedIds(new Set());
      await onApplied();
    } catch (error) {
      setReplaceProgress(null);
      console.error(error);
      const message = error instanceof Error ? error.message : t("cardIcon.replaceFormatFailed");
      toast.error(message);
    } finally {
      setIsReplacing(false);
    }
  }, [convertDirPath, ddsFormat, folderPath, itemsWithFileUrl, onApplied, pixelSource, selectedIds, t]);

  const selectedCount = selectedIds.size;

  return (
    <>
      <Button size="sm" variant="outline" disabled={disabled || itemsWithFileUrl.length === 0} onClick={() => setOpenState(true)}>
        {resolvedTriggerLabel}
      </Button>
      {openState ? (
        <AppRndModalShell
          titleId="card-icon-batch-replace-title"
          title={t("cardIcon.batchTitle")}
          subtitle={t("cardIcon.batchSubtitle")}
          headerIcon={<Images className="h-5 w-5 text-primary" />}
          dimensions={CARD_ICON_BATCH_REPLACE_MODAL_DIMENSIONS}
          storageKey="app.rnd-size.card-icon-batch-replace"
          onClose={() => setOpenState(false)}
          closeDisabled={isReplacing}
          footer={
            <div className="flex flex-wrap justify-end gap-2 bg-background px-6 py-4">
              <Button variant="outline" onClick={() => setOpenState(false)} disabled={isReplacing}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={() => void handleReplace()}
                disabled={selectedCount === 0 || isReplacing}
              >
                {isReplacing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("common.replacing")}
                  </>
                ) : (
                  t("cardIcon.replaceNImages", { count: selectedCount })
                )}
              </Button>
            </div>
          }
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <Label>{t("cardIcon.pixelSource")}</Label>
              <p className="text-xs text-muted-foreground leading-snug">
                <span className="font-semibold text-foreground">{t("cardIcon.originalNutexb")}</span>
                {t("cardIcon.decodeDisk")}{" "}
                <span className="font-semibold text-foreground">{t("cardIcon.convertPng")}</span>
                {t("cardIcon.usePreview")}{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]" data-i18n-ignore="">
                  __convert
                </code>{" "}
                {t("cardIcon.previewParen")}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]" data-i18n-ignore="">
                  {"{name}.png"}
                </code>
                {t("cardIcon.runExport")}
              </p>
            </div>
            <Select
              value={pixelSource}
              onValueChange={(v) => setPixelSource(v as ReplacePixelSource)}
              disabled={isReplacing}
            >
              <SelectTrigger className="h-8 w-full sm:w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nutexb">{t("cardIcon.originalNutexb")}</SelectItem>
                <SelectItem value="convertPng">{t("cardIcon.convertPng")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-2">
            <Label>{t("common.ddsFormat")}</Label>
            <Select value={ddsFormat} onValueChange={setDdsFormat} disabled={isReplacing}>
              <SelectTrigger className="w-[220px] h-8">
                <SelectValue placeholder={t("common.selectFormat")} />
              </SelectTrigger>
              <SelectContent>
                {DDS_FORMATS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("cardIcon.imagesTotal", { count: itemsWithFileUrl.length })}</Label>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={selectAll} disabled={isReplacing}>
                  {t("cardIcon.selectAll")}
                </Button>
                <Button size="sm" variant="ghost" onClick={deselectAll} disabled={isReplacing}>
                  {t("cardIcon.deselectAll")}
                </Button>
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("cardIcon.searchPlaceholder")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-8"
                disabled={isReplacing}
              />
            </div>

            {searchTerm.trim() && (
              <div className="text-xs text-muted-foreground">
                {t("cardIcon.showingOf", { shown: filteredItems.length, total: itemsWithFileUrl.length })}
              </div>
            )}

            <p className="text-xs text-muted-foreground leading-snug">
              {t("cardIcon.shiftHint")}{" "}
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[10px] font-mono">{t("cardIcon.shift")}</kbd>{" "}
              {t("cardIcon.shiftHintRest")}
            </p>

            <div ref={listRef} className="h-[240px] overflow-auto rounded-md border border-border p-2">
              {filteredItems.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  {searchTerm.trim()
                    ? t("cardIcon.noMatch", { term: searchTerm.trim() })
                    : t("cardIcon.noImagesAvailable")}
                </div>
              ) : (
                <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const item = filteredItems[virtualRow.index];
                    if (!item) return null;
                    const filteredIndex = virtualRow.index;
                    return (
                      <div
                        key={item.itemIndex}
                        className="absolute left-0 top-0 flex w-full cursor-pointer select-none items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/50"
                        style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
                        onMouseDownCapture={(e) =>
                          handleListRowMouseDownCapture(e, filteredIndex, item.itemIndex)
                        }
                      >
                        <Checkbox
                          id={`batch-replace-${item.itemIndex}`}
                          checked={selectedIds.has(item.itemIndex)}
                          onCheckedChange={() =>
                            handleCheckboxCheckedChange(filteredIndex, item.itemIndex)
                          }
                          disabled={isReplacing}
                        />
                        <span className="min-w-0 flex-1 cursor-pointer truncate text-sm font-normal text-foreground">
                          {item.name ?? `#${item.itemIndex}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {replaceProgress && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {t("cardIcon.processingOf", {
                      current: replaceProgress.current,
                      total: replaceProgress.total,
                    })}
                  </span>
                  <span className="truncate max-w-[280px]" title={replaceProgress.currentFileName}>
                    {replaceProgress.currentFileName}
                  </span>
                </div>
                <Progress
                  value={(replaceProgress.current / replaceProgress.total) * 100}
                  className="h-2"
                />
              </div>
            )}
          </div>
        </div>
        </AppRndModalShell>
      ) : null}
    </>
  );
}
