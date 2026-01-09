import { useCallback, useDeferredValue, useMemo, useRef, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SeriesData } from "@/models/seriesList";
import { cn } from "@/lib/utils";
import { SeriesCard } from "./SeriesCard";

interface SeriesListProps {
  seriesData: SeriesData[];
  seriesImageConvertDirPath?: string;
  seriesImageSeriesBaseNameOrder?: Array<string | null>;
  selectedIndex: number;
  onSelect: (index: number) => void;
  onDelete: (index: number) => void;
  onCopy: (index: number) => void;
}

type SortKey = "none" | "index" | "SeriesId" | "iconFileIndex" | "unk2" | "unk3" | "unk4" | "unk5" | "characterListPosition";

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "none", label: "No sort" },
  { value: "index", label: "Index (min → max)" },
  { value: "SeriesId", label: "SeriesId (positive → negative)" },
  { value: "iconFileIndex", label: "iconFileIndex (min → max)" },
  { value: "unk2", label: "unk2 (min → max)" },
  { value: "unk3", label: "unk3 (min → max)" },
  { value: "unk4", label: "unk4 (min → max)" },
  { value: "unk5", label: "unk5 (min → max)" },
  { value: "characterListPosition", label: "characterListPosition (min → max)" },
];

export function SeriesList({
  seriesData,
  seriesImageConvertDirPath,
  seriesImageSeriesBaseNameOrder,
  selectedIndex,
  onSelect,
  onDelete,
  onCopy,
}: SeriesListProps) {
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
        const name = row.unkStr1?.Utf8String || "";
        return name.toLowerCase().includes(term) || idx.toString().includes(term);
      });
  }, [seriesData, deferredSearchTerm]);

  const sortedRows = useMemo(() => {
    if (sortKey === "none") return filteredRows;

    const getValue = (row: SeriesData, idx: number): number | string => {
      switch (sortKey) {
        case "index":
          return idx;
        case "SeriesId":
          return row.SeriesId;
        case "iconFileIndex":
          return row.iconFileIndex;
        case "unk2":
          return row.unk2;
        case "unk3":
          return row.unk3;
        case "unk4":
          return row.unk4;
        case "unk5":
          return row.unk5;
        case "characterListPosition":
          return row.characterListPosition;
        default:
          return idx;
      }
    };

    const isNumberLike = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
    const compare = (a: { row: SeriesData; idx: number }, b: { row: SeriesData; idx: number }) => {
      const av = getValue(a.row, a.idx);
      const bv = getValue(b.row, b.idx);

      if (isNumberLike(av) && isNumberLike(bv)) {
        // For SeriesId, sort positive values first, then negative values
        if (sortKey === "SeriesId") {
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
            placeholder="Search by name or index..."
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
              <SelectValue placeholder="Sort..." />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>


      {searchTerm.trim() && (
        <div className="text-xs text-muted-foreground mb-2">
          Found {filteredRows.length} of {seriesData.length} series
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
            {searchTerm.trim() ? `No series found matching "${searchTerm.trim()}"` : "No series available"}
          </div>
        )}
      </div>
    </div>
  );
}

