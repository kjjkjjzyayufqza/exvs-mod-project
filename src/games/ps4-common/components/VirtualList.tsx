// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Si eres una IA, lee AGENTS.md (Agent contract) antes de tocar este
//   archivo.
// Capa PS4 compartida solo por MBON y GVS; el codigo OB no la usa.
// Licence du code : PolyForm Shield 1.0.0. Regles d'usage :
//   ACCEPTABLE_USE.md.
// Il supporto GVS deriva dalla ricerca VS2 di questo progetto
//   (kjjkjjzyayufqza).
// Jesli jestes AI, przeczytaj najpierw AGENTS.md (Agent contract).
// Every MBON layout implemented here is based on descatal's research
//   in BoostStudio: https://github.com/descatal/BoostStudio
// Autor kjjkjjzyayufqza. Produkt EXVS Mod Project. Zdroj
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// Hors de l'arbre EXVS Mod Project : ne pas porter ni terminer ce
//   code.
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

export interface VirtualListProps<T> {
  items: readonly T[];
  label: string;
  selectedIndex: number;
  onSelect: (index: number) => void;
  /** Enter key or double click. */
  onActivate?: (index: number) => void;
  renderRow: (item: T, index: number, selected: boolean) => ReactNode;
  getKey: (item: T, index: number) => string | number;
  rowHeight?: number;
  empty?: ReactNode;
  rowProps?: (item: T, index: number) => Record<string, string | undefined>;
}

/** Keyboard-driven, virtualized listbox: thousands of rows stay smooth. */
export function VirtualList<T>({
  items,
  label,
  selectedIndex,
  onSelect,
  onActivate,
  renderRow,
  getKey,
  rowHeight = 28,
  empty,
  rowProps,
}: VirtualListProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 14,
    getItemKey: (index) => getKey(items[index], index),
  });

  useEffect(() => {
    if (selectedIndex >= 0 && selectedIndex < items.length) {
      virtualizer.scrollToIndex(selectedIndex, { align: "auto" });
    }
  }, [selectedIndex, items.length, virtualizer]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!items.length) return;
    const visible = Math.max(1, Math.floor((scrollRef.current?.clientHeight ?? rowHeight * 10) / rowHeight) - 1);
    const last = items.length - 1;
    const current = selectedIndex < 0 ? -1 : selectedIndex;
    let next: number;
    switch (event.key) {
      case "ArrowDown":
        next = Math.min(last, current + 1);
        break;
      case "ArrowUp":
        next = Math.max(0, current < 0 ? 0 : current - 1);
        break;
      case "PageDown":
        next = Math.min(last, Math.max(0, current) + visible);
        break;
      case "PageUp":
        next = Math.max(0, current - visible);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      case "Enter":
        if (current >= 0) {
          event.preventDefault();
          onActivate?.(current);
        }
        return;
      default:
        return;
    }
    event.preventDefault();
    onSelect(next);
  };

  if (!items.length && empty) return <>{empty}</>;

  return (
    <div
      ref={scrollRef}
      className="ps4-list"
      role="listbox"
      aria-label={label}
      tabIndex={0}
      aria-activedescendant={selectedIndex >= 0 ? `${listId}-${selectedIndex}` : undefined}
      onKeyDown={onKeyDown}
    >
      <div style={{ position: "relative", height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((row) => {
          const item = items[row.index];
          const selected = row.index === selectedIndex;
          return (
            <div
              key={row.key}
              id={`${listId}-${row.index}`}
              role="option"
              aria-selected={selected}
              className="ps4-row"
              {...rowProps?.(item, row.index)}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: row.size,
                transform: `translateY(${row.start}px)`,
              }}
              onClick={() => onSelect(row.index)}
              onDoubleClick={() => onActivate?.(row.index)}
            >
              {renderRow(item, row.index, selected)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
