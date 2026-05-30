import { memo, useCallback, useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";

interface VirtualizedListProps<T> {
  /** Source items. Kept live: pass the current array on every render. */
  items: T[];
  /** Fixed pixel height of every row. */
  rowHeight: number;
  /** Stable React key for an item (avoid array index when rows can be reordered). */
  getItemKey: (item: T, index: number) => string | number;
  /** Renders a single row. The wrapper handles positioning and height. */
  renderRow: (item: T, index: number) => ReactNode;
  /** Classes for the scroll container. Must establish a bounded height. */
  className?: string;
  /** Below this count rows render plainly so small lists stay simple. */
  virtualizeThreshold?: number;
  /** Extra rows rendered outside the viewport for smoother scrolling. */
  overscan?: number;
  /** Shown instead of the list when there are no items. */
  emptyState?: ReactNode;
}

const DEFAULT_THRESHOLD = 30;

/**
 * Threshold-based virtualized list shared across Scene Editor panels.
 * Mirrors the inline pattern in MeshReadonlyTab so reactivity stays intact:
 * the parent owns the data, this component only windows the DOM.
 */
function VirtualizedListInner<T>({
  items,
  rowHeight,
  getItemKey,
  renderRow,
  className,
  virtualizeThreshold = DEFAULT_THRESHOLD,
  overscan = 8,
  emptyState,
}: VirtualizedListProps<T>) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const getScrollElement = useCallback(() => scrollRef.current, []);

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement,
    estimateSize: () => rowHeight,
    overscan,
  });

  if (items.length === 0 && emptyState !== undefined) {
    return (
      <div ref={scrollRef} className={className}>
        {emptyState}
      </div>
    );
  }

  const shouldVirtualize = items.length > virtualizeThreshold;

  return (
    <div ref={scrollRef} className={className}>
      {shouldVirtualize ? (
        <div style={{ height: rowVirtualizer.getTotalSize(), width: "100%", position: "relative" }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const item = items[virtualRow.index];
            if (item === undefined) return null;
            return (
              <div
                key={getItemKey(item, virtualRow.index)}
                className={cn("absolute left-0 top-0 w-full")}
                style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
              >
                {renderRow(item, virtualRow.index)}
              </div>
            );
          })}
        </div>
      ) : (
        items.map((item, index) => (
          <div key={getItemKey(item, index)} style={{ height: rowHeight }}>
            {renderRow(item, index)}
          </div>
        ))
      )}
    </div>
  );
}

export const VirtualizedList = memo(VirtualizedListInner) as typeof VirtualizedListInner;
