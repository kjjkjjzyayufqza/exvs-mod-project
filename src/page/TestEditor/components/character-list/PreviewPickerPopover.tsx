import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Package, SkipForward, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { GuiPackPreviewThumb } from "./GuiPackPreviewThumb";

export const PREVIEW_PICKER_ROW_HEIGHT = 64;

export type PreviewPickerItem = {
  value: number;
  label: string;
  previewSrc: string;
  secondaryText?: string;
  searchText?: string;
  nutexbPath?: string | null;
  canExtract?: boolean;
};

interface PreviewPickerPopoverProps {
  title: string;
  triggerAriaLabel: string;
  onSelect: (value: number) => void;
  items: PreviewPickerItem[];
  selectedValue?: number;
  isLoading?: boolean;
  error?: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  filterPlaceholder?: string;
  sort?: (a: PreviewPickerItem, b: PreviewPickerItem) => number;
  onExtract?: (value: number) => void;
  extractingValue?: number | null;
}

export function PreviewPickerPopover({
  title,
  triggerAriaLabel,
  onSelect,
  items,
  selectedValue,
  isLoading,
  error,
  open: openProp,
  onOpenChange,
  filterPlaceholder = "Filter by value or name...",
  sort,
  onExtract,
  extractingValue = null,
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
      if (it.searchText && it.searchText.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [deferredQuery, sortedItems]);

  const selectedItem = useMemo(() => {
    if (selectedValue === undefined) return null;
    return sortedItems.find((it) => it.value === selectedValue) ?? null;
  }, [sortedItems, selectedValue]);

  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const getListScrollElement = useCallback(() => scrollElement, [scrollElement]);
  const estimateRowSize = useCallback(() => PREVIEW_PICKER_ROW_HEIGHT, []);
  const getItemKey = useCallback(
    (index: number) => filteredItems[index]?.value ?? index,
    [filteredItems],
  );

  const rowVirtualizer = useVirtualizer({
    count: filteredItems.length,
    getScrollElement: getListScrollElement,
    estimateSize: estimateRowSize,
    getItemKey,
    overscan: 8,
  });

  useEffect(() => {
    if (!open) return;
    if (!scrollElement) return;
    rowVirtualizer.measure();
  }, [open, rowVirtualizer, scrollElement, filteredItems.length]);

  useEffect(() => {
    if (!open) return;
    if (!scrollElement) return;
    if (selectedValue === undefined) return;
    const idx = filteredItems.findIndex((it) => it.value === selectedValue);
    if (idx >= 0) {
      requestAnimationFrame(() => {
        rowVirtualizer.scrollToIndex(idx, { align: "center" });
      });
    }
  }, [open, scrollElement, selectedValue, filteredItems, rowVirtualizer]);

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
        className="w-80 max-w-80 overflow-hidden p-0"
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

        {selectedItem && (
          <div className="px-3 py-2 border-b bg-muted/30">
            <div className="text-xs text-muted-foreground mb-1">Selected</div>
            <div className="flex items-center gap-2 overflow-hidden">
              <GuiPackPreviewThumb
                nutexbPath={selectedItem.nutexbPath}
                previewSrc={selectedItem.previewSrc}
                alt={selectedItem.label}
                className="h-8 w-16"
              />
              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="truncate text-sm font-medium">{selectedItem.label}</div>
                <div
                  className="truncate font-mono text-xs text-muted-foreground"
                  title={selectedItem.searchText ?? selectedItem.secondaryText}
                >
                  {selectedItem.secondaryText ?? `Value: ${selectedItem.value}`}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2 p-3">
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
            className={cn("h-[600px] overflow-auto pr-2", filteredItems.length === 0 && "rounded-md border")}
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
                    data-index={virtualItem.index}
                    style={{
                      position: "absolute",
                      top: virtualItem.start,
                      left: 0,
                      width: "100%",
                      height: PREVIEW_PICKER_ROW_HEIGHT,
                      maxHeight: PREVIEW_PICKER_ROW_HEIGHT,
                      overflow: "hidden",
                      paddingRight: "0.25rem",
                    }}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      title={it.searchText ?? it.secondaryText}
                      className={cn(
                        "flex h-full min-h-0 w-full items-center gap-2 overflow-hidden rounded-md border px-2 text-left cursor-pointer hover:bg-accent/30",
                        it.value === selectedValue && "border-primary bg-primary/10",
                      )}
                      onClick={() => {
                        onSelect(it.value);
                        setOpen(false);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        onSelect(it.value);
                        setOpen(false);
                      }}
                    >
                      <GuiPackPreviewThumb
                        key={it.value}
                        nutexbPath={it.nutexbPath}
                        previewSrc={it.previewSrc}
                        alt={it.label}
                        className="h-12 w-24"
                      />
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <div className="truncate text-sm font-medium">{it.label}</div>
                        <div className="truncate font-mono text-xs text-muted-foreground">
                          {it.secondaryText ? it.secondaryText : `Value: ${it.value}`}
                        </div>
                      </div>
                      {it.canExtract && onExtract ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          disabled={extractingValue === it.value}
                          aria-label="Extract 009gui pack"
                          title="Extract pack to workspace"
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.stopPropagation();
                          }}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onExtract(it.value);
                          }}
                        >
                          <Package className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredItems.length === 0 && (
              <div className="py-6 text-center text-xs text-muted-foreground">No results.</div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
