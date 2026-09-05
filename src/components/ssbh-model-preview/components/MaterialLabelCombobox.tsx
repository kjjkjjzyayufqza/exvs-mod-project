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
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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

interface MaterialLabelComboboxProps {
  value: string;
  options: string[];
  onChange: (label: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

function dedupeOptions(options: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const option of options) {
    const trimmed = option.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
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
    top: openUpward ? rect.top - MENU_GAP_PX - maxHeight : rect.bottom + MENU_GAP_PX,
    maxHeight,
  };
}

/**
 * Searchable material-label picker with create-new support. Generic sibling of
 * SceneTextureSelectPicker: portal-rendered menu, ChevronsUpDown toggle, up/down flip, and a
 * "Use custom" row for values not yet in the option set. Options are typically the union of a
 * model's maya+nust numatb material_labels plus the labels already used in the numdlb rows.
 */
export function MaterialLabelCombobox({
  value,
  options,
  onChange,
  disabled,
  className,
  placeholder = "Select or type material...",
}: MaterialLabelComboboxProps) {
  const { t } = useTranslation("ssbh-components");
  const instanceId = useId();
  const listboxId = `${instanceId}-material-listbox`;
  const inputId = `${instanceId}-material-input`;
  const anchorRef = useRef<HTMLDivElement>(null);

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

  const allOptions = useMemo(() => dedupeOptions(options), [options]);
  const queryTrim = deferredQuery.trim().toLowerCase();

  const filteredOptions = useMemo(() => {
    if (!queryTrim) return allOptions.slice(0, MAX_OPTIONS_WITHOUT_QUERY);
    return allOptions
      .filter((option) => option.toLowerCase().includes(queryTrim))
      .slice(0, MAX_OPTIONS_FILTERED);
  }, [allOptions, queryTrim]);

  const exactMatch = useMemo(() => {
    if (!queryTrim) return null;
    return allOptions.find((option) => option.toLowerCase() === queryTrim) ?? null;
  }, [allOptions, queryTrim]);

  const commitValue = (next: string) => {
    const trimmed = next.trim();
    setInputValue(trimmed);
    if (trimmed !== value.trim()) {
      onChange(trimmed);
    }
  };

  const selectOption = (label: string) => {
    setInputValue(label);
    if (label.trim() !== value.trim()) {
      onChange(label);
    }
    setOpen(false);
  };

  const menu =
    open && menuPosition
      ? createPortal(
          <>
            <div
              className="fixed inset-0 z-[var(--z-popover-elevated)]"
              aria-hidden
              onMouseDown={() => setOpen(false)}
            />
            <div
              className="fixed z-[var(--z-popover-elevated)] overflow-y-auto overscroll-contain rounded-md border bg-popover text-popover-foreground shadow-md"
              style={{
                top: menuPosition.top,
                left: menuPosition.left,
                width: menuPosition.width,
                maxHeight: menuPosition.maxHeight,
              }}
              onWheel={(event) => event.stopPropagation()}
            >
              <div id={listboxId} role="listbox" aria-label={t("material.listLabel")} className="p-1">
                {allOptions.length > MAX_OPTIONS_WITHOUT_QUERY && !queryTrim && (
                  <p className="px-2 py-1 text-[10px] text-muted-foreground">
                    {t("material.showingFirst", { shown: MAX_OPTIONS_WITHOUT_QUERY, total: allOptions.length })}
                  </p>
                )}

                {filteredOptions.map((label) => {
                  const selected = label.toLowerCase() === inputValue.trim().toLowerCase();
                  return (
                    <button
                      key={label}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[11px] hover:bg-accent",
                        selected && "bg-accent",
                      )}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectOption(label)}
                    >
                      <Check className={cn("h-3.5 w-3.5 shrink-0", selected ? "opacity-100" : "opacity-0")} />
                      <span className="truncate font-mono">{label}</span>
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
                    <span className="text-muted-foreground">{t("material.useCustom")}:</span>
                    <span className="truncate font-mono">{inputValue.trim()}</span>
                  </button>
                )}

                {filteredOptions.length === 0 && !queryTrim && (
                  <p className="px-2 py-4 text-center text-[11px] text-muted-foreground">
                    {t("material.empty")}
                  </p>
                )}
              </div>
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
          name={`${instanceId}-material`}
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-autocomplete="list"
          value={inputValue}
          disabled={disabled}
          autoComplete="off"
          placeholder={placeholder ?? t("material.placeholder")}
          className="h-8 pr-7 text-[11px]"
          onFocus={() => setOpen(true)}
          onChange={(event) => setInputValue(event.target.value)}
          onBlur={() => commitValue(inputValue)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
            }
            if (event.key === "Enter") {
              commitValue(inputValue);
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
          aria-label={t("material.showSuggestions")}
          className="absolute right-0 top-0 h-8 w-7 shrink-0 text-muted-foreground"
          onClick={() => setOpen((current) => !current)}
        >
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </div>
      {menu}
    </>
  );
}
