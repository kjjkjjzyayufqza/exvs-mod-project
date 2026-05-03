import { useMemo, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { formatHash } from "@/models/commandTable";
import { filterTypedParamEntryRows } from "../../param-editor/paramEntryUtils";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import type { EditorEntryRow } from "./types";

interface EntryListPanelProps {
  entries: TypedParamEntry[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  renderLabel?: (row: EditorEntryRow) => React.ReactNode;
  className?: string;
}

export function EntryListPanel({
  entries,
  selectedIndex,
  onSelect,
  renderLabel,
  className,
}: EntryListPanelProps) {
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();

  const filteredRows = useMemo(
    () => filterTypedParamEntryRows(entries, search),
    [entries, search],
  );

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
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {filteredRows.length === 0 ? (
          <div className="flex h-28 items-center justify-center px-3 text-center text-xs text-muted-foreground">
            No entries match.
          </div>
        ) : (
          filteredRows.map(({ entry, index, entryId }) => (
            <button
              key={`${index}-${entryId}`}
              type="button"
              className={`flex w-full flex-col border-b border-border/40 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/50 ${
                selectedIndex === index
                  ? "border-l-2 border-l-primary bg-primary/10"
                  : "border-l-2 border-l-transparent"
              }`}
              onClick={() => onSelect(index)}
            >
              <div className="flex items-center justify-between">
                <span className="truncate font-mono font-medium">
                  {renderLabel
                    ? renderLabel({ entry, index, entryId })
                    : formatHash(entryId)}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  #{index}
                </span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
