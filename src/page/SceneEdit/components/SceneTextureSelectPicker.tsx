import { useDeferredValue, useEffect, useId, useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useSceneTextureManagerStore } from "../store/sceneTextureManagerStore";

const MAX_OPTIONS_WITHOUT_QUERY = 80;
const MAX_OPTIONS_FILTERED = 200;

interface SceneTextureSelectPickerProps {
  value: string;
  paramId: string;
  onChange: (basename: string) => void;
  disabled?: boolean;
  className?: string;
}

export function SceneTextureSelectPicker({
  value,
  paramId: _paramId,
  onChange,
  disabled,
  className,
}: SceneTextureSelectPickerProps) {
  const instanceId = useId();
  const listboxId = `${instanceId}-texture-listbox`;
  const inputId = `${instanceId}-texture-input`;

  const entries = useSceneTextureManagerStore((s) => s.entries);
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const deferredQuery = useDeferredValue(inputValue);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const textureOptions = useMemo(
    () => entries.map((entry) => entry.filename),
    [entries],
  );

  const filteredOptions = useMemo(() => {
    const query = deferredQuery.trim().toLowerCase();
    if (!query) {
      return textureOptions.slice(0, MAX_OPTIONS_WITHOUT_QUERY);
    }
    return textureOptions
      .filter((filename) => filename.toLowerCase().includes(query))
      .slice(0, MAX_OPTIONS_FILTERED);
  }, [textureOptions, deferredQuery]);

  const queryTrim = deferredQuery.trim().toLowerCase();
  const filteredTruncated = useMemo(() => {
    if (!queryTrim) {
      return textureOptions.length > MAX_OPTIONS_WITHOUT_QUERY;
    }
    const count = textureOptions.filter((filename) =>
      filename.toLowerCase().includes(queryTrim),
    ).length;
    return count > MAX_OPTIONS_FILTERED;
  }, [textureOptions, queryTrim]);

  const exactMatch = useMemo(() => {
    if (!queryTrim) return null;
    return (
      textureOptions.find((filename) => filename.toLowerCase() === queryTrim) ??
      null
    );
  }, [textureOptions, queryTrim]);

  const commitValue = (next: string) => {
    setInputValue(next);
    onChange(next);
  };

  const selectOption = (filename: string) => {
    commitValue(filename);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className={cn("relative w-full", className)}>
          <Input
            id={inputId}
            name={`${instanceId}-texture`}
            role="combobox"
            aria-expanded={open}
            aria-controls={open ? listboxId : undefined}
            aria-autocomplete="list"
            value={inputValue}
            disabled={disabled}
            autoComplete="off"
            placeholder="Select or type texture..."
            className="h-7 pr-7 text-xs"
            onFocus={() => setOpen(true)}
            onChange={(event) => commitValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setOpen(false);
              }
              if (event.key === "ArrowDown" && !open) {
                event.preventDefault();
                setOpen(true);
              }
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label="Show texture suggestions"
            className="absolute right-0 top-0 h-7 w-7 shrink-0 text-muted-foreground"
            onClick={() => setOpen((current) => !current)}
          >
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" />
          </Button>
        </div>
      </PopoverAnchor>

      <PopoverContent
        className="w-[var(--radix-popover-anchor-width)] p-0"
        align="start"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <ScrollArea className="h-[min(240px,36vh)]">
          <div id={listboxId} role="listbox" aria-label="Scene textures" className="p-1">
            {textureOptions.length > MAX_OPTIONS_WITHOUT_QUERY && !queryTrim && (
              <p className="px-2 py-1 text-[10px] text-muted-foreground">
                Showing first {MAX_OPTIONS_WITHOUT_QUERY} of {textureOptions.length}{" "}
                textures. Type to search.
              </p>
            )}
            {filteredTruncated && (
              <p className="px-2 py-1 text-[10px] text-muted-foreground">
                List capped for performance. Narrow your search.
              </p>
            )}

            {filteredOptions.map((filename) => {
              const selected =
                filename.toLowerCase() === inputValue.trim().toLowerCase();
              return (
                <button
                  key={filename}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[11px] hover:bg-accent",
                    selected && "bg-accent",
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectOption(filename)}
                >
                  <Check
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      selected ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate font-mono">{filename}</span>
                </button>
              );
            })}

            {queryTrim && !exactMatch && (
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="flex w-full items-center gap-2 rounded-sm border-t px-2 py-1.5 text-left text-[11px] hover:bg-accent"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectOption(inputValue.trim())}
              >
                <span className="text-muted-foreground">Use custom:</span>
                <span className="truncate font-mono">{inputValue.trim()}</span>
              </button>
            )}

            {filteredOptions.length === 0 && !queryTrim && (
              <p className="px-2 py-4 text-center text-[11px] text-muted-foreground">
                No scene textures yet. Type a custom name above.
              </p>
            )}

            {filteredOptions.length === 0 && queryTrim && exactMatch && (
              <p className="px-2 py-4 text-center text-[11px] text-muted-foreground">
                No additional matches.
              </p>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
