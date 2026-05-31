import { useDeferredValue, useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

/** Avoid rendering hundreds of option rows when the list is huge (perf + a11y). */
const MAX_OPTIONS_WITHOUT_QUERY = 120;
const MAX_OPTIONS_FILTERED = 400;

type BoneIndexSearchSelectProps = {
  value: number;
  onChange: (next: number) => void;
  boneNames: string[] | null;
  disabled?: boolean;
  className?: string;
  /** Unique prefix for id/name (e.g. from useId). */
  instanceId: string;
  /** Accessible name for the combobox trigger (per row). */
  ariaLabel: string;
};

export function BoneIndexSearchSelect({
  value,
  onChange,
  boneNames,
  disabled = false,
  className,
  instanceId,
  ariaLabel,
}: BoneIndexSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const searchInputId = `${instanceId}-bone-search`;
  const triggerId = `${instanceId}-bone-trigger`;
  const fallbackNumId = `${instanceId}-bone-index-num`;

  const options = useMemo(() => {
    if (!boneNames?.length) return [];
    const q = deferredQuery.trim().toLowerCase();
    const all = boneNames.map((name, index) => ({ index, name }));
    if (!q) {
      return all.slice(0, MAX_OPTIONS_WITHOUT_QUERY);
    }
    const filtered = all.filter(
      ({ index, name }) => `${index}`.includes(q) || name.toLowerCase().includes(q),
    );
    return filtered.slice(0, MAX_OPTIONS_FILTERED);
  }, [boneNames, deferredQuery]);

  const totalBones = boneNames?.length ?? 0;
  const qTrim = deferredQuery.trim().toLowerCase();

  const filteredSearchTruncated = useMemo(() => {
    if (!boneNames?.length || !qTrim) return false;
    const n = boneNames.filter(
      (name, index) =>
        `${index}`.includes(qTrim) || name.toLowerCase().includes(qTrim),
    ).length;
    return n > MAX_OPTIONS_FILTERED;
  }, [boneNames, qTrim]);

  const label = useMemo(() => {
    if (!boneNames?.length) return `${value}`;
    const name = boneNames[value];
    if (name === undefined) return `${value} (out of range)`;
    return `${value}. ${name}`;
  }, [boneNames, value]);

  if (!boneNames?.length) {
    return (
      <Input
        id={fallbackNumId}
        name={`${instanceId}-bone-index`}
        type="number"
        min={0}
        max={0xffffffff}
        className={cn("h-8 font-mono text-[11px]", className)}
        value={Number.isFinite(value) ? String(value) : ""}
        disabled={disabled}
        autoComplete="off"
        aria-label={ariaLabel}
        onChange={(e) => {
          const n = Number.parseInt(e.target.value, 10);
          if (!Number.isFinite(n) || n < 0) {
            onChange(0);
            return;
          }
          onChange(Math.min(0xffffffff, n) >>> 0);
        }}
      />
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={triggerId}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          aria-controls={open ? `${instanceId}-bone-listbox` : undefined}
          disabled={disabled}
          className={cn("h-8 w-full justify-between px-2 font-mono text-[11px]", className)}
        >
          <span className="truncate text-left">{label}</span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="flex flex-col gap-1 border-b p-2">
          <Label htmlFor={searchInputId} className="sr-only">
            Search bone index or name
          </Label>
          <Input
            id={searchInputId}
            name={`${instanceId}-bone-search`}
            placeholder="Search index or name..."
            className="h-8 text-[11px]"
            value={query}
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <ScrollArea className="h-[min(280px,40vh)]">
          <div id={`${instanceId}-bone-listbox`} className="p-1" role="listbox" aria-label="Bone list">
            {totalBones > MAX_OPTIONS_WITHOUT_QUERY && !qTrim && (
              <p className="px-2 py-1 text-[10px] text-muted-foreground">
                Showing first {MAX_OPTIONS_WITHOUT_QUERY} of {totalBones} bones. Type to search.
              </p>
            )}
            {filteredSearchTruncated && (
              <p className="px-2 py-1 text-[10px] text-muted-foreground">
                List capped for performance. Narrow your search.
              </p>
            )}
            {options.map(({ index, name }) => (
              <button
                key={index}
                type="button"
                role="option"
                aria-selected={index === value}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[11px] hover:bg-accent",
                  index === value && "bg-accent",
                )}
                onClick={() => {
                  onChange(index >>> 0);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <Check className={cn("h-3.5 w-3.5", index === value ? "opacity-100" : "opacity-0")} />
                <span className="font-mono">
                  {index}. {name}
                </span>
              </button>
            ))}
            {options.length === 0 && (
              <p className="px-2 py-4 text-center text-[11px] text-muted-foreground">No matches.</p>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
