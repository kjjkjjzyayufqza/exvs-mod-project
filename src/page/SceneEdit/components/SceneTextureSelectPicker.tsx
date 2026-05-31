import {
  useDeferredValue,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronsUpDown } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useSceneTextureManagerStore } from "../store/sceneTextureManagerStore";

const MAX_OPTIONS_WITHOUT_QUERY = 80;
const MAX_OPTIONS_FILTERED = 200;
const MENU_GAP_PX = 4;
const MENU_MAX_HEIGHT_PX = 240;

interface MenuPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

interface SceneTextureSelectPickerProps {
  value: string;
  paramId: string;
  onChange: (basename: string) => void;
  disabled?: boolean;
  className?: string;
}

function stripNutexbExtension(value: string): string {
  return value.replace(/\.nutexb$/i, "");
}

function normalizeTextureBasename(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const filename = trimmed.replace(/\\/g, "/").split("/").pop() ?? trimmed;
  return stripNutexbExtension(filename);
}

function buildOrderedTextureOptions(
  entries: Array<{ id: string; filename: string; referencedBy?: string[] }>,
  recentEntryIds: string[],
  currentValue: string,
): string[] {
  const entryNameById = new Map(
    entries.map((entry) => [entry.id, stripNutexbExtension(entry.filename)]),
  );
  const normalizedCurrentValue = normalizeTextureBasename(currentValue).toLowerCase();
  const currentEntryName =
    entries.find(
      (entry) =>
        stripNutexbExtension(entry.filename).toLowerCase() === normalizedCurrentValue,
    )?.filename ?? null;
  const ordered: string[] = [];
  const seen = new Set<string>();

  const pushOption = (option: string | null | undefined) => {
    const trimmed = option?.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    ordered.push(trimmed);
  };

  pushOption(currentEntryName ? stripNutexbExtension(currentEntryName) : null);
  for (const id of recentEntryIds) {
    pushOption(entryNameById.get(id));
  }
  for (const entry of entries) {
    if ((entry.referencedBy?.length ?? 0) !== 0) continue;
    pushOption(stripNutexbExtension(entry.filename));
  }
  for (const entry of entries) {
    if ((entry.referencedBy?.length ?? 0) === 0) continue;
    pushOption(stripNutexbExtension(entry.filename));
  }

  return ordered;
}

function measureMenuPosition(anchor: HTMLElement): MenuPosition {
  const rect = anchor.getBoundingClientRect();
  const viewportPadding = 12;
  const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
  const spaceAbove = rect.top - viewportPadding;
  const openUpward = spaceBelow < 160 && spaceAbove > spaceBelow;
  const maxHeight = Math.min(
    MENU_MAX_HEIGHT_PX,
    Math.max(120, openUpward ? spaceAbove - MENU_GAP_PX : spaceBelow - MENU_GAP_PX),
  );

  return {
    left: rect.left,
    width: rect.width,
    top: openUpward
      ? rect.top - MENU_GAP_PX - maxHeight
      : rect.bottom + MENU_GAP_PX,
    maxHeight,
  };
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
  const anchorRef = useRef<HTMLDivElement>(null);

  const { entries, recentEntryIds } = useSceneTextureManagerStore(
    useShallow((state) => ({
      entries: state.entries,
      recentEntryIds: state.recentEntryIds,
    })),
  );
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const deferredQuery = useDeferredValue(inputValue);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setMenuPosition(null);
      return;
    }

    const updatePosition = () => {
      if (!anchorRef.current) return;
      setMenuPosition(measureMenuPosition(anchorRef.current));
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, inputValue]);

  const textureOptions = useMemo(
    () => buildOrderedTextureOptions(entries, recentEntryIds, value),
    [entries, recentEntryIds, value],
  );

  const normalizedQuery = useMemo(
    () => normalizeTextureBasename(deferredQuery),
    [deferredQuery],
  );

  const filteredOptions = useMemo(() => {
    const query = normalizedQuery.toLowerCase();
    if (!query) {
      return textureOptions.slice(0, MAX_OPTIONS_WITHOUT_QUERY);
    }
    return textureOptions
      .filter((filename) => filename.toLowerCase().includes(query))
      .slice(0, MAX_OPTIONS_FILTERED);
  }, [textureOptions, normalizedQuery]);

  const queryTrim = normalizedQuery.toLowerCase();
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
    const stripped = normalizeTextureBasename(next);
    setInputValue(stripped);
    onChange(stripped);
  };

  const setInputOnly = (next: string) => {
    setInputValue(next);
  };

  const selectOption = (filename: string) => {
    commitValue(filename);
    setOpen(false);
  };

  const menu =
    open && menuPosition
      ? createPortal(
          <>
            <div
              className="fixed inset-0 z-9999"
              aria-hidden
              onMouseDown={() => setOpen(false)}
            />
            <div
              className="fixed z-10000 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
              style={{
                top: menuPosition.top,
                left: menuPosition.left,
                width: menuPosition.width,
                maxHeight: menuPosition.maxHeight,
              }}
            >
              <ScrollArea className="h-full max-h-[inherit]">
                <div
                  id={listboxId}
                  role="listbox"
                  aria-label="Scene textures"
                  className="p-1"
                >
                  {textureOptions.length > MAX_OPTIONS_WITHOUT_QUERY && !queryTrim && (
                    <p className="px-2 py-1 text-[10px] text-muted-foreground">
                      Showing first {MAX_OPTIONS_WITHOUT_QUERY} of{" "}
                      {textureOptions.length} textures. Type to search.
                    </p>
                  )}
                  {filteredTruncated && (
                    <p className="px-2 py-1 text-[10px] text-muted-foreground">
                      List capped for performance. Narrow your search.
                    </p>
                  )}

                  {filteredOptions.map((filename) => {
                    const selected =
                      filename.toLowerCase() === normalizeTextureBasename(inputValue).toLowerCase();
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
            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <>
      <div ref={anchorRef} className={cn("relative w-full", className)}>
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
          onChange={(event) => setInputOnly(event.target.value)}
          onBlur={() => {
            const trimmed = inputValue.trim();
            if (normalizeTextureBasename(trimmed) !== normalizeTextureBasename(value)) {
              commitValue(trimmed);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
            }
            if (event.key === "Enter") {
              commitValue(inputValue.trim());
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
      {menu}
    </>
  );
}
