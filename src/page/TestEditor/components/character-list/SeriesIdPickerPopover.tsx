import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { SkipForward, X } from "lucide-react";

export type SeriesIdPickerItem = {
  id: number;
  iconFileIndex: number;
  label: string;
  previewSrc: string;
};

export function SeriesIdPickerPopover(props: {
  onSelect: (id: number) => void;
  items: SeriesIdPickerItem[];
  isLoading?: boolean;
  error?: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { onSelect, items, isLoading, error } = props;
  const [openInternal, setOpenInternal] = useState(false);
  const open = props.open ?? openInternal;
  const setOpen = props.onOpenChange ?? setOpenInternal;
  const [query, setQuery] = useState("");

  const sorted = useMemo(() => {
    const copy = [...items];
    copy.sort((a, b) => {
      if (a.iconFileIndex !== b.iconFileIndex) return a.iconFileIndex - b.iconFileIndex;
      return a.id - b.id;
    });
    return copy;
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((it) => it.label.toLowerCase().includes(q) || String(it.id).includes(q));
  }, [sorted, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="m-0 p-0 h-4"
          aria-label="Open Series ID picker"
          title="Open Series ID picker"
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
          <div className="text-sm font-semibold">Series ID Picker</div>
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
            placeholder="Filter by ID or name..."
            className="h-8"
          />
          <Separator />
          {isLoading && (
            <div className="text-xs text-muted-foreground">Loading series list...</div>
          )}
          {!isLoading && error && (
            <div className="text-xs text-destructive">Failed to load series list</div>
          )}
          <ScrollArea className="h-[600px] pr-2">
            <div className="space-y-1">
              {filtered.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className="w-full flex items-center gap-3 rounded-md border px-2 py-2 text-left hover:bg-accent/30"
                  onClick={() => {
                    onSelect(it.id);
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
                    <div className="text-xs text-muted-foreground font-mono">ID: {it.id}</div>
                  </div>
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="text-xs text-muted-foreground py-6 text-center">
                  No results.
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  );
}


