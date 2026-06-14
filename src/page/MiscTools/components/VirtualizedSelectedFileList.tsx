import { useRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FileImage, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type SelectedFileListItem = {
  path: string;
  title: string;
  description?: string;
};

type VirtualizedSelectedFileListProps = {
  items: SelectedFileListItem[];
  onRemove: (path: string) => void;
  showPreview?: boolean;
  height?: number;
};

export function VirtualizedSelectedFileList({
  items,
  onRemove,
  showPreview = false,
  height = 240,
}: VirtualizedSelectedFileListProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => 68,
    getItemKey: (index) => items[index]?.path ?? index,
    overscan: 5,
  });

  return (
    <div
      ref={viewportRef}
      className="overflow-y-auto overscroll-contain"
      style={{ height: `${height}px` }}
    >
      <div className="relative w-full" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              className="absolute left-0 top-0 w-full pb-2"
              style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="flex h-15 items-center gap-3 rounded-md border p-2">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                  {showPreview ? (
                    <img
                      src={convertFileSrc(item.path)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <FileImage className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  {item.description ? (
                    <p className="truncate text-xs text-muted-foreground">{item.description}</p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {virtualRow.index + 1} of {items.length}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  aria-label="Remove file"
                  onClick={() => onRemove(item.path)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
