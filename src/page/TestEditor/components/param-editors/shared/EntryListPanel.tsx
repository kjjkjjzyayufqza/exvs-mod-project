import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search } from "lucide-react";
import { formatHash } from "@/models/commandTable";
import { filterTypedParamEntryRows } from "../../param-editor/paramEntryUtils";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import type { EditorEntryRow } from "./types";

const ENTRY_ROW_HEIGHT = 40;

interface EntryListPanelProps {
  entries: TypedParamEntry[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  renderLabel?: (row: EditorEntryRow) => React.ReactNode;
  /** Fixed row height for virtualization. Increase when renderLabel is multi-line. */
  rowHeight?: number;
  className?: string;
}

export function EntryListPanel({
  entries,
  selectedIndex,
  onSelect,
  renderLabel,
  rowHeight = ENTRY_ROW_HEIGHT,
  className,
}: EntryListPanelProps) {
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const listRef = useRef<HTMLDivElement | null>(null);

  const filteredRows = useMemo(
    () => filterTypedParamEntryRows(entries, search),
    [entries, search],
  );
  const getListScrollElement = useCallback(() => listRef.current, []);
  const rowVirtualizer = useVirtualizer({
    count: filteredRows.length,
    getScrollElement: getListScrollElement,
    estimateSize: () => rowHeight,
    // Measure real row height so long unbroken labels (break-all wrap) don't clip.
    measureElement: (element) =>
      element?.getBoundingClientRect().height ?? rowHeight,
    overscan: 12,
  });

  return (
    <div
      className={`flex h-full min-h-0 flex-col overflow-hidden rounded-md border bg-card shadow-sm ${className ?? ""}`}
    >
      <div className="space-y-2 border-b bg-muted/20 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold">Entries</h3>
          <span className="font-mono text-[10px] text-muted-foreground">
            {search.trim()
              ? `${filteredRows.length} / ${entries.length}`
              : `${entries.length}`}
            {isPending ? " ..." : ""}
          </span>
        </div>
        <div className="flex items-center gap-1 rounded-md border bg-background px-2 py-1 shadow-sm">
          <Search className="h-3 w-3 text-muted-foreground" />
          <input
            value={searchDraft}
            onChange={(e) => {
              const next = e.target.value;
              setSearchDraft(next);
              startTransition(() => setSearch(next));
            }}
            placeholder="Search id / field / value..."
            className="h-4 w-full bg-transparent font-mono text-[10px] outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {filteredRows.length === 0 ? (
          <div className="flex h-28 items-center justify-center px-3 text-center text-xs text-muted-foreground">
            No entries match.
          </div>
        ) : (
          <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = filteredRows[virtualRow.index];
              if (!row) return null;
              const { entry, index, entryId } = row;
              return (
                <button
                  key={`${index}-${entryId}`}
                  type="button"
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  className={`absolute left-0 top-0 flex w-full flex-col border-b border-border/40 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/50 ${
                    selectedIndex === index
                      ? "border-l-2 border-l-primary bg-primary/10"
                      : "border-l-2 border-l-transparent"
                  }`}
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  onClick={() => onSelect(index)}
                >
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 overflow-hidden">
                      {renderLabel ? (
                        renderLabel({ entry, index, entryId })
                      ) : (
                        <span className="block truncate font-mono font-medium">
                          {formatHash(entryId)}
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      #{index}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
