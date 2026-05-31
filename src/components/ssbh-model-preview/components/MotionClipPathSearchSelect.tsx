import { useDeferredValue, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const MAX_OPTIONS_WITHOUT_QUERY = 120;
const MAX_OPTIONS_FILTERED = 400;

function normalizePathForSearch(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}

function basename(path: string): string {
  const n = path.replace(/\\/g, "/");
  const parts = n.split("/");
  return parts[parts.length - 1] ?? path;
}

type MotionClipPathSearchSelectProps = {
  paths: readonly string[];
  value: string | null;
  onChange: (path: string) => void;
  disabled?: boolean;
  className?: string;
};

export function MotionClipPathSearchSelect({
  paths,
  value,
  onChange,
  disabled = false,
  className,
}: MotionClipPathSearchSelectProps) {
  const reactId = useId();
  const instanceId = `motion-clip-${reactId.replace(/:/g, "")}`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const searchInputId = `${instanceId}-search`;
  const triggerId = `${instanceId}-trigger`;
  const selectedOptionRef = useRef<HTMLButtonElement | null>(null);

  const options = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const rows = paths.map((path) => ({
      path,
      base: basename(path),
      norm: normalizePathForSearch(path),
    }));
    if (!q) {
      if (rows.length <= MAX_OPTIONS_WITHOUT_QUERY) {
        return rows;
      }
      if (!value) {
        return rows.slice(0, MAX_OPTIONS_WITHOUT_QUERY);
      }
      const idx = paths.indexOf(value);
      if (idx < 0) {
        return rows.slice(0, MAX_OPTIONS_WITHOUT_QUERY);
      }
      const half = Math.floor(MAX_OPTIONS_WITHOUT_QUERY / 2);
      const start = Math.max(0, Math.min(idx - half, rows.length - MAX_OPTIONS_WITHOUT_QUERY));
      return rows.slice(start, start + MAX_OPTIONS_WITHOUT_QUERY);
    }
    const filtered = rows.filter(
      ({ base, norm }) => base.toLowerCase().includes(q) || norm.includes(q),
    );
    return filtered.slice(0, MAX_OPTIONS_FILTERED);
  }, [paths, deferredQuery, value]);

  useLayoutEffect(() => {
    if (!open || !value) {
      return;
    }
    const id = requestAnimationFrame(() => {
      selectedOptionRef.current?.scrollIntoView({ block: "center", behavior: "instant" });
    });
    return () => cancelAnimationFrame(id);
  }, [open, value, deferredQuery]);

  const totalPaths = paths.length;
  const qTrim = deferredQuery.trim().toLowerCase();

  const filteredSearchTruncated = useMemo(() => {
    if (!qTrim) return false;
    const n = paths.filter((path) => {
      const base = basename(path).toLowerCase();
      const norm = normalizePathForSearch(path);
      return base.includes(qTrim) || norm.includes(qTrim);
    }).length;
    return n > MAX_OPTIONS_FILTERED;
  }, [paths, qTrim]);

  const triggerLabel = value ? basename(value) : "Select .nuanmb";

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setQuery("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={triggerId}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? `${instanceId}-listbox` : undefined}
          disabled={disabled}
          title={value ?? undefined}
          className={cn("h-8 w-full justify-between px-2 text-[10px] font-mono", className)}
        >
          <span className="truncate text-left">{triggerLabel}</span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[min(100vw-24px,22rem)] p-0" align="start">
        <div className="flex flex-col gap-1 border-b p-2">
          <Label htmlFor={searchInputId} className="sr-only">
            Search motion clips
          </Label>
          <Input
            id={searchInputId}
            name={`${instanceId}-search`}
            placeholder="Search by file name or path…"
            className="h-8 text-[10px]"
            value={query}
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <ScrollArea className="h-[min(280px,40vh)]">
          <div id={`${instanceId}-listbox`} className="p-1" role="listbox" aria-label="Motion clips">
            {totalPaths > MAX_OPTIONS_WITHOUT_QUERY && !qTrim && (
              <p className="px-2 py-1 text-[10px] text-muted-foreground">
                Showing first {MAX_OPTIONS_WITHOUT_QUERY} of {totalPaths} clips. Type to search.
              </p>
            )}
            {filteredSearchTruncated && (
              <p className="px-2 py-1 text-[10px] text-muted-foreground">
                List capped for performance. Narrow your search.
              </p>
            )}
            {options.map(({ path, base }) => (
              <button
                key={path}
                ref={path === value ? selectedOptionRef : undefined}
                type="button"
                role="option"
                aria-selected={path === value}
                className={cn(
                  "flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-[10px] hover:bg-accent",
                  path === value && "bg-accent",
                )}
                title={path}
                onClick={() => {
                  onChange(path);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <Check className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", path === value ? "opacity-100" : "opacity-0")} />
                <span className="min-w-0 break-all font-mono">{base}</span>
              </button>
            ))}
            {options.length === 0 && (
              <p className="px-2 py-4 text-center text-[10px] text-muted-foreground">No matches.</p>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
