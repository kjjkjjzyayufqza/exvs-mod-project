import { useCallback, useDeferredValue, useMemo, useRef, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { StageDataGVSEntry, StageListGVS } from "@/models/stageList";
import { StageGvsForm } from "./StageGvsForm";
import { useTranslation } from "react-i18next";

export type StageListGvsSortKey =
  | "index"
  | "unk1"
  | "fileName"
  | "unk3"
  | "unk4"
  | "unk5"
  | "unk6"
  | "unk7"
  | "stg_grd_1"
  | "stg_full"
  | "stg_vs_2"
  | "stg_grd_2"
  | "unk12";

const SORT_KEYS: StageListGvsSortKey[] = [
  "index",
  "unk1",
  "fileName",
  "unk3",
  "unk4",
  "unk5",
  "unk6",
  "unk7",
  "stg_grd_1",
  "stg_full",
  "stg_vs_2",
  "stg_grd_2",
  "unk12",
];

interface StageGvsViewerProps {
  stageListData: StageListGVS;
  selectedIndex: number;
  onSelectChange: (index: number) => void;
  sortKey?: StageListGvsSortKey;
  onSortKeyChange?: (key: StageListGvsSortKey) => void;
  searchInputValue?: string;
  searchTerm?: string;
  onSearchInputChange?: (value: string) => void;
  onSearchTermChange?: (value: string) => void;
  isComposing?: boolean;
  onComposingChange?: (value: boolean) => void;
  searchDir?: string;
}

export function StageGvsViewer({
  stageListData,
  selectedIndex,
  onSelectChange,
  sortKey: controlledSortKey,
  onSortKeyChange,
  searchInputValue: controlledInputValue,
  searchTerm: controlledSearchTerm,
  onSearchInputChange,
  onSearchTermChange,
  isComposing: controlledIsComposing,
  onComposingChange,
  searchDir = "",
}: StageGvsViewerProps) {
  const { t } = useTranslation("test-stage-list-view");
  const [internalInputValue, setInternalInputValue] = useState("");
  const [internalSearchTerm, setInternalSearchTerm] = useState("");
  const [internalIsComposing, setInternalIsComposing] = useState(false);
  const [internalSortKey, setInternalSortKey] = useState<StageListGvsSortKey>("index");

  const isControlled =
    onSortKeyChange != null &&
    onSearchInputChange != null &&
    onSearchTermChange != null &&
    onComposingChange != null;

  const sortKey = isControlled ? (controlledSortKey ?? "index") : internalSortKey;
  const inputValue = isControlled ? (controlledInputValue ?? "") : internalInputValue;
  const searchTerm = isControlled ? (controlledSearchTerm ?? "") : internalSearchTerm;
  const isComposing = isControlled ? (controlledIsComposing ?? false) : internalIsComposing;

  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [, startTransition] = useTransition();
  const listParentRef = useRef<HTMLDivElement | null>(null);

  const handleInputChange = useCallback(
    (value: string) => {
      if (isControlled && onSearchInputChange) {
        onSearchInputChange(value);
        if (!(controlledIsComposing ?? false)) {
          startTransition(() => onSearchTermChange?.(value));
        }
      } else {
        setInternalInputValue(value);
        if (!internalIsComposing) {
          startTransition(() => setInternalSearchTerm(value));
        }
      }
    },
    [controlledIsComposing, internalIsComposing, isControlled, onSearchInputChange, onSearchTermChange]
  );

  const handleCompositionStart = useCallback(() => {
    if (isControlled && onComposingChange) {
      onComposingChange(true);
      return;
    }
    setInternalIsComposing(true);
  }, [isControlled, onComposingChange]);

  const handleCompositionEnd = useCallback(
    (e: React.CompositionEvent<HTMLInputElement>) => {
      const value = (e.target as HTMLInputElement).value;
      if (isControlled && onComposingChange && onSearchTermChange) {
        onComposingChange(false);
        startTransition(() => onSearchTermChange(value));
        return;
      }
      setInternalIsComposing(false);
      startTransition(() => setInternalSearchTerm(value));
    },
    [isControlled, onComposingChange, onSearchTermChange]
  );

  const filteredRows = useMemo(() => {
    const term = deferredSearchTerm.trim();
    const rows = stageListData.StageData.map((row, idx) => ({ row, idx }));
    if (!term) return rows;

    const lower = term.toLowerCase();
    return rows.filter(({ row, idx }) => {
      const parts = [
        idx.toString(),
        String(row.unk1),
        String(row.fileName),
        String(row.unk3),
        String(row.unk4),
        String(row.unk5),
        String(row.unk6),
        String(row.unk7),
        String(row.stg_grd_1),
        String(row.stg_full),
        String(row.stg_vs_2),
        String(row.stg_grd_2),
        String(row.unk12),
        String(row.name?.Utf8String ?? ""),
      ];
      return parts.some((part) => part.toLowerCase().includes(lower));
    });
  }, [deferredSearchTerm, stageListData.StageData]);

  const sortedRows = useMemo(() => {
    const getValue = (row: StageDataGVSEntry, idx: number): number => {
      switch (sortKey) {
        case "index":
          return idx;
        case "unk1":
          return row.unk1;
        case "fileName":
          return row.fileName;
        case "unk3":
          return row.unk3;
        case "unk4":
          return row.unk4;
        case "unk5":
          return row.unk5;
        case "unk6":
          return row.unk6;
        case "unk7":
          return row.unk7;
        case "stg_grd_1":
          return row.stg_grd_1;
        case "stg_full":
          return row.stg_full;
        case "stg_vs_2":
          return row.stg_vs_2;
        case "stg_grd_2":
          return row.stg_grd_2;
        case "unk12":
          return row.unk12;
        default:
          return idx;
      }
    };

    return [...filteredRows].sort((a, b) => {
      const av = getValue(a.row, a.idx);
      const bv = getValue(b.row, b.idx);
      if (av !== bv) return av - bv;
      return a.idx - b.idx;
    });
  }, [filteredRows, sortKey]);

  const rowVirtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: () => listParentRef.current,
    estimateSize: () => 74,
    overscan: 10,
  });

  const selectedStage = useMemo(() => {
    if (selectedIndex < 0) return null;
    return stageListData.StageData[selectedIndex] ?? null;
  }, [selectedIndex, stageListData.StageData]);

  return (
    <div className="flex h-full gap-4 min-h-0">
      <div className="w-1/3 border rounded-lg p-3 overflow-hidden flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold text-sm">{t("gvsViewer.countLabel", { count: stageListData.StageData.length })}</div>
        </div>

        <div className="grid items-center gap-2 mb-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder={t("gvsViewer.searchPlaceholder")}
              value={inputValue}
              onChange={(e) => handleInputChange(e.target.value)}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              className="pl-10 h-8"
            />
          </div>

          <div className="relative flex-1 min-w-0">
            <Select
              value={sortKey}
              onValueChange={(value) => {
                const nextKey = value as StageListGvsSortKey;
                if (isControlled && onSortKeyChange) {
                  startTransition(() => onSortKeyChange(nextKey));
                  return;
                }
                startTransition(() => setInternalSortKey(nextKey));
              }}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder={t("gvsViewer.sortPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {SORT_KEYS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`gvsViewer.sort.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {searchTerm.trim() ? (
          <div className="text-xs text-muted-foreground mb-2">
            {t("gvsViewer.foundOf", { found: filteredRows.length, total: stageListData.StageData.length })}
          </div>
        ) : null}

        <div
          ref={listParentRef}
          className={cn("flex-1 min-h-0 overflow-auto", sortedRows.length === 0 && "border rounded-md")}
        >
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualItem) => {
              const item = sortedRows[virtualItem.index];
              if (!item) return null;

              const stageName = item.row.name?.Utf8String ?? "";
              return (
                <div
                  key={virtualItem.key}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                    paddingRight: "0.25rem",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onSelectChange(item.idx)}
                    className={cn(
                      "w-full h-full border rounded-md px-3 py-2 text-left hover:bg-accent/50 transition-colors",
                      item.idx === selectedIndex && "ring-2 ring-inset ring-primary bg-accent"
                    )}
                  >
                    <div className="text-sm font-medium line-clamp-2 break-all">
                      {stageName || t("gvsViewer.fallbackName", { index: item.idx })}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {t("gvsViewer.rowMeta", { index: item.idx, fileName: item.row.fileName, unk12: item.row.unk12 })}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>

          {sortedRows.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 text-sm">
              {searchTerm.trim()
                ? t("gvsViewer.noMatch", { term: searchTerm.trim() })
                : t("gvsViewer.noEntries")}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex-1 border rounded-lg p-4 overflow-auto flex flex-col min-h-0">
        {selectedStage ? (
          <StageGvsForm
            stage={selectedStage}
            index={selectedIndex}
            searchDir={searchDir}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            {t("gvsViewer.selectEntry")}
          </div>
        )}
      </div>
    </div>
  );
}
