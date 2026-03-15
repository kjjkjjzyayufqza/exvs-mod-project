import { useDeferredValue, useMemo, useState } from "react";
import { SkipForward, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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

  const filteredIndexes = useMemo(() => {
    if (maxIndex < 0) return [];
    const allIndexes = Array.from({ length: maxIndex + 1 }, (_, idx) => idx);
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return allIndexes;
    return allIndexes.filter((idx) => {
      if (String(idx).includes(q)) return true;
      for (const group of groupedMap) {
        const label = group.byIndex.get(idx)?.name ?? "";
        if (label.toLowerCase().includes(q)) return true;
      }
      return false;
    });
  }, [deferredQuery, groupedMap, maxIndex]);

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

          <div className="h-[600px] overflow-auto pr-1 border rounded-md">
            {filteredIndexes.length === 0 ? (
              <div className="text-xs text-muted-foreground py-6 text-center">No results.</div>
            ) : (
              <div className="p-2 space-y-2">
                {filteredIndexes.map((idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`w-full rounded-md border px-2 py-2 text-left hover:bg-accent/30 ${idx === selectedValue ? "border-primary bg-primary/10" : ""}`}
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
                ))}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
