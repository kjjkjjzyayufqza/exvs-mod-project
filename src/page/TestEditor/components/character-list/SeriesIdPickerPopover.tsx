import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";

type SeriesIdPickerItem = {
  id: number;
  label: string;
  previewSrc: string;
};

export function SeriesIdPickerPopover(props: { onSelect: (id: number) => void }) {
  const { onSelect } = props;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const items = useMemo<SeriesIdPickerItem[]>(
    () => [
      { id: 0, label: "None", previewSrc: "/tauri.svg" },
      { id: 1, label: "Sample A", previewSrc: "/vite.svg" },
      { id: 2, label: "Sample B", previewSrc: "/tauri.svg" },
      { id: 3, label: "Sample C", previewSrc: "/vite.svg" },
      { id: 10, label: "Sample 10", previewSrc: "/tauri.svg" },
      { id: 33, label: "Sample 33", previewSrc: "/vite.svg" },
      { id: 99, label: "Sample 99", previewSrc: "/tauri.svg" },
      { id: 123, label: "Sample 123", previewSrc: "/vite.svg" },
    ],
    []
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.label.toLowerCase().includes(q) || String(it.id).includes(q));
  }, [items, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          aria-label="Open Series ID picker"
          title="Open Series ID picker"
        >
          ?
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
          <ScrollArea className="h-[320px] pr-2">
            <div className="space-y-1">
              {filtered.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className="w-full flex items-center gap-3 rounded-md border px-2 py-2 text-left hover:bg-accent/30"
                  onClick={() => onSelect(it.id)}
                >
                  <img
                    src={it.previewSrc}
                    alt={it.label}
                    className="h-8 w-8 rounded bg-muted object-contain"
                    loading="lazy"
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


