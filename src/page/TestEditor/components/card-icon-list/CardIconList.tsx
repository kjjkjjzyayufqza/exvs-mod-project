import { useCallback, useDeferredValue, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CardIconItem } from "./cardIconStructure";
import { CardIconCard } from "./CardIconCard";

interface CardIconListProps {
  items: CardIconItem[];
  folderPath: string;
  convertDirPath?: string;
  selectedIndex: number;
  onSelect: (index: number) => void;
  onReplaced: () => Promise<void> | void;
  onRemove: (item: CardIconItem) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  isUpdating?: boolean;
  /** When set, cards at this itemIndex show linked-hover outline (dual-column sync) */
  hoveredItemIndex?: number | null;
  onHoverItemIndex?: (itemIndex: number | null) => void;
}

export function CardIconList({
  items,
  folderPath,
  convertDirPath,
  selectedIndex,
  onSelect,
  onReplaced,
  onRemove,
  onMove,
  isUpdating = false,
  hoveredItemIndex = null,
  onHoverItemIndex,
}: CardIconListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearchTerm = useDeferredValue(searchTerm);

  const listParentRef = useRef<HTMLDivElement | null>(null);
  const getListScrollElement = useCallback(() => listParentRef.current, []);
  const estimateRowSize = useCallback(() => 96, []);

  const filteredItems = useMemo(() => {
    const term = deferredSearchTerm.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => {
      const name = item.name ?? "";
      return name.toLowerCase().includes(term) || item.itemIndex.toString().includes(term);
    });
  }, [items, deferredSearchTerm]);

  const getItemKey = useCallback(
    (index: number) => {
      const it = filteredItems[index];
      if (!it) return index;
      const stable = it.fileIndex ?? it.fileUrl ?? it.name;
      return stable ?? index;
    },
    [filteredItems]
  );

  const rowVirtualizer = useVirtualizer({
    count: filteredItems.length,
    getScrollElement: getListScrollElement,
    estimateSize: estimateRowSize,
    getItemKey,
    overscan: 10,
  });

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="relative min-w-0 mb-3">
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
          Found {filteredItems.length} of {items.length} icons
        </div>
      )}

      <div ref={listParentRef} className={cn("flex-1 min-h-0 overflow-auto", filteredItems.length === 0 && "border rounded-md")}>
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualItem) => {
            const item = filteredItems[virtualItem.index];
            if (!item) return null;
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
                <CardIconCard
                  item={item}
                  folderPath={folderPath}
                  convertDirPath={convertDirPath}
                  isSelected={item.itemIndex === selectedIndex}
                  onClick={() => onSelect(item.itemIndex)}
                  onEdit={() => onSelect(item.itemIndex)}
                  onReplaced={onReplaced}
                  onRemove={() => onRemove(item)}
                  totalCount={items.length}
                  isUpdating={isUpdating}
                  onMove={(toIndex) => onMove(item.itemIndex, toIndex)}
                  isHovered={onHoverItemIndex ? item.itemIndex === hoveredItemIndex : false}
                  onHoverChange={onHoverItemIndex ? (hovered) => onHoverItemIndex(hovered ? item.itemIndex : null) : undefined}
                />
              </div>
            );
          })}
        </div>

        {filteredItems.length === 0 && (
          <div className="text-center text-muted-foreground py-8 text-sm">
            {searchTerm.trim() ? `No icons found matching "${searchTerm.trim()}"` : "No icons available"}
          </div>
        )}
      </div>
    </div>
  );
}
