import { useCallback, useDeferredValue, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { Input } from "@/components/ui/input";
import type { SeriesData } from "@/models/seriesList";
import { cn } from "@/lib/utils";
import { SeriesCard } from "./SeriesCard";

interface SeriesListProps {
  seriesData: SeriesData[];
  seriesImageConvertDirPath?: string;
  selectedIndex: number;
  onSelect: (index: number) => void;
  onDelete: (index: number) => void;
  onCopy: (index: number) => void;
}

export function SeriesList({ seriesData, seriesImageConvertDirPath, selectedIndex, onSelect, onDelete, onCopy }: SeriesListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearchTerm = useDeferredValue(searchTerm);

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

  const rowVirtualizer = useVirtualizer({
    count: filteredRows.length,
    getScrollElement: getListScrollElement,
    estimateSize: estimateRowSize,
    overscan: 10,
  });

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input
          placeholder="Search by name or index..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 h-8"
        />
      </div>

      {searchTerm.trim() && (
        <div className="text-xs text-muted-foreground mb-2">
          Found {filteredRows.length} of {seriesData.length} series
        </div>
      )}

      <div ref={listParentRef} className={cn("flex-1 min-h-0 overflow-auto", filteredRows.length === 0 && "border rounded-md")}>
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualItem) => {
            const item = filteredRows[virtualItem.index];
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
                  isSelected={idx === selectedIndex}
                  onClick={() => onSelect(idx)}
                  onDelete={() => onDelete(idx)}
                  onCopy={() => onCopy(idx)}
                />
              </div>
            );
          })}
        </div>

        {filteredRows.length === 0 && (
          <div className="text-center text-muted-foreground py-8 text-sm">
            {searchTerm.trim() ? `No series found matching "${searchTerm.trim()}"` : "No series available"}
          </div>
        )}
      </div>
    </div>
  );
}

