import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { SkipForward, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export type PreviewPickerItem = {
  value: number;
  label: string;
  previewSrc: string;
  secondaryText?: string;
};

interface PreviewPickerPopoverProps {
  title: string;
  triggerAriaLabel: string;
  onSelect: (value: number) => void;
  items: PreviewPickerItem[];
  isLoading?: boolean;
  error?: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  filterPlaceholder?: string;
  sort?: (a: PreviewPickerItem, b: PreviewPickerItem) => number;
}

export function PreviewPickerPopover({
  title,
  triggerAriaLabel,
  onSelect,
  items,
  isLoading,
  error,
  open: openProp,
  onOpenChange,
  filterPlaceholder = "Filter by value or name...",
  sort,
}: PreviewPickerPopoverProps) {
  const [openInternal, setOpenInternal] = useState(false);
  const open = openProp ?? openInternal;
  const setOpen = onOpenChange ?? setOpenInternal;

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const sortedItems = useMemo(() => {
    if (!sort) return items;
    const copy = [...items];
    copy.sort(sort);
    return copy;
  }, [items, sort]);

  const filteredItems = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return sortedItems;
    return sortedItems.filter((it) => {
      if (it.label.toLowerCase().includes(q)) return true;
      if (String(it.value).includes(q)) return true;
      if (it.secondaryText && it.secondaryText.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [deferredQuery, sortedItems]);

  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const getListScrollElement = useCallback(() => scrollElement, [scrollElement]);
  const estimateRowSize = useCallback(() => 76, []);

  const rowVirtualizer = useVirtualizer({
    count: filteredItems.length,
    getScrollElement: getListScrollElement,
    estimateSize: estimateRowSize,
    overscan: 10,
  });

  useEffect(() => {
    if (!open) return;
    if (!scrollElement) return;
    rowVirtualizer.measure();
  }, [open, rowVirtualizer, scrollElement, filteredItems.length]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="m-0 p-0 h-4"
          aria-label={triggerAriaLabel}
          title={triggerAriaLabel}
        >
          <SkipForward />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="right"
        sideOffset={8}
        className="w-[320px] p-0"
        onPointerDownOutside={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={() => setOpen(false)}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="text-sm font-semibold">{title}</div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setOpen(false)}
            aria-label="Close"
            title="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-3 space-y-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={filterPlaceholder}
            className="h-8"
          />
          <Separator />
          {isLoading && <div className="text-xs text-muted-foreground">Loading...</div>}
          {!isLoading && error && <div className="text-xs text-destructive">Failed to load</div>}

          <div
            ref={setScrollElement}
            className={cn("h-[600px] overflow-auto pr-2", filteredItems.length === 0 && "border rounded-md")}
          >
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                const it = filteredItems[virtualItem.index];
                if (!it) return null;
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
                      className="w-full flex items-center gap-3 rounded-md border px-2 py-2 text-left hover:bg-accent/30"
                      onClick={() => {
                        onSelect(it.value);
                        setOpen(false);
                      }}
                    >
                      <img
                        src={it.previewSrc}
                        alt={it.label}
                        className="h-12 w-24 rounded bg-black object-contain"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.src = "/tauri.svg";
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{it.label}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {it.secondaryText ? it.secondaryText : `Value: ${it.value}`}
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>

            {filteredItems.length === 0 && (
              <div className="text-xs text-muted-foreground py-6 text-center">No results.</div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

