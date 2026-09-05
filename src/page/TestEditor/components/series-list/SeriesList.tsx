import { useCallback, useDeferredValue, useMemo, useRef, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SeriesListEntry } from "@/models/seriesListEntry";
import { cn } from "@/lib/utils";
import { SeriesCard } from "./SeriesCard";

interface SeriesListProps {
  seriesData: SeriesListEntry[];
  seriesImageConvertDirPath?: string;
  seriesImageSeriesBaseNameOrder?: Array<string | null>;
  editable?: boolean;
  selectedIndex: number;
  onSelect: (index: number) => void;
  onDelete: (index: number) => void;
  onCopy: (index: number) => void;
}

type SortKey =
  | "none"
  | "index"
  | "entryId"
  | "iconFileIndex"
  | "recordLookupId"
  | "unk0x08"
  | "displayNameRef"
  | "characterListPosition";

const SORT_KEYS: SortKey[] = [
  "none",
  "index",
  "entryId",
  "iconFileIndex",
  "recordLookupId",
  "unk0x08",
  "displayNameRef",
  "characterListPosition",
];

export function SeriesList({
  seriesData,
  seriesImageConvertDirPath,
  seriesImageSeriesBaseNameOrder,
  editable = true,
  selectedIndex,
  onSelect,
  onDelete,
  onCopy,
}: SeriesListProps) {
  const { t } = useTranslation("test-lists");
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [sortKey, setSortKey] = useState<SortKey>("none");
  const [, startTransition] = useTransition();

  const listParentRef = useRef<HTMLDivElement | null>(null);
  const getListScrollElement = useCallback(() => listParentRef.current, []);
  const estimateRowSize = useCallback(() => 96, []);

  const filteredRows = useMemo(() => {
    const term = deferredSearchTerm.trim().toLowerCase();
    if (!term) return seriesData.map((row, idx) => ({ row, idx }));
    return seriesData
      .map((row, idx) => ({ row, idx }))
      .filter(({ row, idx }) => {
        const name = row.name || "";
        return name.toLowerCase().includes(term) || idx.toString().includes(term);
      });
  }, [seriesData, deferredSearchTerm]);

  const sortedRows = useMemo(() => {
    if (sortKey === "none") return filteredRows;

    const getValue = (row: SeriesListEntry, idx: number): number | string => {
      switch (sortKey) {
        case "index":
          return idx;
        case "entryId":
          return row.entryId;
        case "iconFileIndex":
          return row.iconFileIndex;
        case "recordLookupId":
          return row.recordLookupId;
        case "unk0x08":
          return row.unk0x08;
        case "displayNameRef":
          return row.displayNameRef;
        case "characterListPosition":
          return row.characterListPosition;
        default:
          return idx;
      }
    };

    const isNumberLike = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
    const compare = (a: { row: SeriesListEntry; idx: number }, b: { row: SeriesListEntry; idx: number }) => {
      const av = getValue(a.row, a.idx);
      const bv = getValue(b.row, b.idx);

      if (isNumberLike(av) && isNumberLike(bv)) {
        // For Series ID, sort positive values first, then negative values
        if (sortKey === "entryId") {
          const aIsPositive = av > 0;
          const bIsPositive = bv > 0;
          
          // Positive values come before negative values
          if (aIsPositive && !bIsPositive) return -1;
          if (!aIsPositive && bIsPositive) return 1;
          
          // Within same sign group, sort by value (min → max)
          if (av !== bv) return av - bv;
          return a.idx - b.idx;
        }
        
        // For other numeric fields, use standard min → max sorting
        if (av !== bv) return av - bv;
        return a.idx - b.idx;
      }

      const as = String(av ?? "");
      const bs = String(bv ?? "");
      const r = as.localeCompare(bs, undefined, { numeric: true, sensitivity: "base" });
      if (r !== 0) return r;
      return a.idx - b.idx;
    };

    return [...filteredRows].sort(compare);
  }, [filteredRows, sortKey]);

  const rowVirtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: getListScrollElement,
    estimateSize: estimateRowSize,
    overscan: 10,
  });

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="grid items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder={t("series.searchPlaceholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-8"
          />
        </div>
        <div className="relative flex-1 min-w-0">
          <Select
            value={sortKey}
            onValueChange={(v) => {
              startTransition(() => setSortKey(v as SortKey));
            }}
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder={t("common.sortPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {SORT_KEYS.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`series.sort.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>


      {searchTerm.trim() && (
        <div className="text-xs text-muted-foreground mb-2">
          {t("common.foundOf", { found: filteredRows.length, total: seriesData.length, unit: t("series.unit") })}
        </div>
      )}

      <div ref={listParentRef} className={cn("flex-1 min-h-0 overflow-auto", sortedRows.length === 0 && "border rounded-md")}>
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
            const { row, idx } = item;

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
                <SeriesCard
                  series={row}
                  index={idx}
                  seriesImageConvertDirPath={seriesImageConvertDirPath}
                  seriesImageSeriesBaseNameOrder={seriesImageSeriesBaseNameOrder}
                  editable={editable}
                  isSelected={idx === selectedIndex}
                  onClick={() => onSelect(idx)}
                  onDelete={() => onDelete(idx)}
                  onCopy={() => onCopy(idx)}
                />
              </div>
            );
          })}
        </div>

        {sortedRows.length === 0 && (
          <div className="text-center text-muted-foreground py-8 text-sm">
            {searchTerm.trim() ? t("series.noMatch", { term: searchTerm.trim() }) : t("series.noAvailable")}
          </div>
        )}
      </div>
    </div>
  );
}

