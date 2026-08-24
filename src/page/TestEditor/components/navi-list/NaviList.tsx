import { useCallback, useDeferredValue, useMemo, useRef, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { NaviListEntry } from "@/models/naviListEntry";
import { NaviCard } from "./NaviCard";

interface NaviListProps {
  naviData: NaviListEntry[];
  editable?: boolean;
  selectedIndex: number;
  onSelect: (index: number) => void;
  onDelete: (index: number) => void;
  onCopy: (index: number) => void;
}

export function NaviList({
  naviData,
  editable = true,
  selectedIndex,
  onSelect,
  onDelete,
  onCopy,
}: NaviListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [, startTransition] = useTransition();
  const listParentRef = useRef<HTMLDivElement | null>(null);
  const getListScrollElement = useCallback(() => listParentRef.current, []);
  const estimateRowSize = useCallback(() => 88, []);

  const filteredRows = useMemo(() => {
    const term = deferredSearchTerm.trim().toLowerCase();
    const rows = naviData.map((row, idx) => ({ row, idx }));
    if (!term) return rows;
    return rows.filter(({ row, idx }) => {
      const name = row.displayName || "";
      return (
        name.toLowerCase().includes(term) ||
        idx.toString().includes(term) ||
        String(row.characterUniqueId).includes(term) ||
        String(row.entryId).includes(term)
      );
    });
  }, [naviData, deferredSearchTerm]);

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
          placeholder="Search by name, unique id, or index..."
          value={searchTerm}
          onChange={(event) => {
            const next = event.target.value;
            startTransition(() => setSearchTerm(next));
          }}
          className="pl-10 h-8"
        />
      </div>

      {searchTerm.trim() ? (
        <div className="text-xs text-muted-foreground mb-2">
          Found {filteredRows.length} of {naviData.length} navi rows
        </div>
      ) : null}

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
                <NaviCard
                  navi={row}
                  index={idx}
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
        {filteredRows.length === 0 ? (
          <div className="text-center text-muted-foreground py-8 text-sm">
            {searchTerm.trim() ? `No navi found matching "${searchTerm.trim()}"` : "No navi rows"}
          </div>
        ) : null}
      </div>
    </div>
  );
}
