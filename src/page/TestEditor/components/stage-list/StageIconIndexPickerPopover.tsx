import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useDeferredValue, useMemo, useRef, useState } from "react";
import { SkipForward, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const PICKER_ROW_HEIGHT = 112;
const NUMERIC_QUERY_PATTERN = /^\d+$/;

export type StageIconIndexPickerItem = {
  index: number;
  name: string | null;
  previewSrc: string;
};

export type StageIconIndexPickerGroup = {
  key: string;
  title: string;
  convertDirPath?: string;
  structurePath?: string;
  loadedCount?: number;
  items: StageIconIndexPickerItem[];
};

export function StageIconIndexPickerPopover(props: {
  onSelect: (index: number) => void;
  groups: StageIconIndexPickerGroup[];
  selectedValue?: number;
  isLoading?: boolean;
  error?: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { onSelect, groups, selectedValue, isLoading, error, open: openProp, onOpenChange } = props;
  const [openInternal, setOpenInternal] = useState(false);
  const open = openProp ?? openInternal;
  const setOpen = onOpenChange ?? setOpenInternal;
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const listRef = useRef<HTMLDivElement | null>(null);

  const groupedMap = useMemo(() => {
    return groups.map((group) => {
      const byIndex = new Map<number, StageIconIndexPickerItem>();
      for (const item of group.items) {
        byIndex.set(item.index, item);
      }
      return { ...group, byIndex };
    });
  }, [groups]);

  const maxIndex = useMemo(() => {
    let max = -1;
    for (const group of groups) {
      for (const item of group.items) {
        if (item.index > max) max = item.index;
      }
    }
    return max;
  }, [groups]);

  const searchableIndexLabels = useMemo(() => {
    const labelsByIndex = new Map<number, string[]>();
    for (const group of groups) {
      for (const item of group.items) {
        const name = item.name?.trim().toLowerCase();
        if (!name) continue;
        const labels = labelsByIndex.get(item.index);
        if (labels) {
          labels.push(name);
        } else {
          labelsByIndex.set(item.index, [name]);
        }
      }
    }
    return Array.from(labelsByIndex.entries()).map(([index, labels]) => ({
      index,
      labelText: labels.join("\n"),
    }));
  }, [groups]);

  const filteredIndexes = useMemo(() => {
    if (maxIndex < 0) return [];
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return null;
    const matches = new Set<number>();
    if (NUMERIC_QUERY_PATTERN.test(q)) {
      for (let idx = 0; idx <= maxIndex; idx += 1) {
        if (String(idx).includes(q)) {
          matches.add(idx);
        }
      }
    }
    for (const row of searchableIndexLabels) {
      if (row.labelText.includes(q)) {
        matches.add(row.index);
      }
    }
    return Array.from(matches).sort((left, right) => left - right);
  }, [deferredQuery, maxIndex, searchableIndexLabels]);

  const rowCount = filteredIndexes?.length ?? Math.max(0, maxIndex + 1);
  const getListScrollElement = useCallback(() => listRef.current, []);
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: getListScrollElement,
    estimateSize: () => PICKER_ROW_HEIGHT,
    getItemKey: (rowIndex) => filteredIndexes?.[rowIndex] ?? rowIndex,
    overscan: 6,
  });

  const selectedRows = useMemo(() => {
    if (selectedValue === undefined) return [];
    return groupedMap.map((group) => {
      const item = group.byIndex.get(selectedValue);
      return {
        key: group.key,
        title: group.title,
        item,
      };
    });
  }, [groupedMap, selectedValue]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="m-0 p-0 h-4"
          aria-label="Open Stage Icon Index picker"
          title="Open Stage Icon Index picker"
        >
          <SkipForward />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="right"
        sideOffset={8}
        className="w-[760px] p-0"
        onPointerDownOutside={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={() => setOpen(false)}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="text-sm font-semibold">Stage Icon Index Picker</div>
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

        <div className="p-3 space-y-2 border-b">
          <div className="flex gap-2 min-h-0">
            {groups.map((group) => (
              <div key={group.key} className="flex-1 min-w-0 flex flex-col gap-1.5">
                <div className="text-sm font-medium">{group.title}</div>
                <div className="text-xs text-muted-foreground truncate">
                  Structure: {group.structurePath ?? "-"}
                </div>
                <div className="text-xs text-muted-foreground">
                  Loaded: {group.loadedCount ?? group.items.length} icons
                </div>
              </div>
            ))}
          </div>
          {isLoading && <div className="text-xs text-muted-foreground">Loading icon groups...</div>}
          {!isLoading && error && <div className="text-xs text-destructive">{error}</div>}
        </div>

        {selectedValue !== undefined && (
          <div className="px-3 py-2 border-b bg-muted/30 space-y-2">
            <div className="text-xs text-muted-foreground">Selected Index: {selectedValue}</div>
            <div className="flex gap-2 min-h-0">
              {selectedRows.map((row) => (
                <div key={row.key} className="flex-1 min-w-0 flex items-center gap-2 rounded-md border px-2 py-2">
                  <img
                    src={row.item?.previewSrc ?? "/tauri.svg"}
                    alt={row.item?.name ?? "(empty)"}
                    className="h-9 w-16 rounded bg-black object-contain shrink-0"
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      e.currentTarget.src = "/tauri.svg";
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-muted-foreground">{row.title}</div>
                    <div className="text-sm font-medium truncate">{row.item?.name ?? "(empty)"}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="p-3 space-y-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by index or name..."
            className="h-8"
          />

          <div ref={listRef} className="h-[600px] overflow-auto border rounded-md overscroll-contain">
            {rowCount === 0 ? (
              <div className="text-xs text-muted-foreground py-6 text-center">No results.</div>
            ) : (
              <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const idx = filteredIndexes?.[virtualRow.index] ?? virtualRow.index;
                  return (
                    <div
                      key={virtualRow.key}
                      className="absolute left-0 top-0 w-full px-2 pb-2"
                      style={{
                        height: virtualRow.size,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <button
                        type="button"
                        className={`h-[104px] w-full rounded-md border px-2 py-2 text-left hover:bg-accent/30 ${idx === selectedValue ? "border-primary bg-primary/10" : ""}`}
                        onClick={() => {
                          onSelect(idx);
                          setOpen(false);
                        }}
                      >
                        <div className="text-xs text-muted-foreground font-mono mb-2">Index: {idx}</div>
                        <div className="flex gap-2 min-h-0">
                          {groupedMap.map((group) => {
                            const item = group.byIndex.get(idx);
                            return (
                              <div key={group.key} className="flex-1 min-w-0 flex items-center gap-2 rounded-md border px-2 py-2">
                                <img
                                  src={item?.previewSrc ?? "/tauri.svg"}
                                  alt={item?.name ?? "(empty)"}
                                  className="h-10 w-20 rounded bg-black object-contain shrink-0"
                                  loading="lazy"
                                  decoding="async"
                                  onError={(e) => {
                                    e.currentTarget.src = "/tauri.svg";
                                  }}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs text-muted-foreground">{group.title}</div>
                                  <div className="text-sm font-medium truncate">{item?.name ?? "(empty)"}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
