import { useCallback, useDeferredValue, useMemo, useRef, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { StageDataEntry } from "@/models/stageList";
import { cn } from "@/lib/utils";
import { StageCard } from "./StageCard";

type SortKey =
  | "none"
  | "index"
  | "id"
  | "unk1"
  | "unk2"
  | "unk3"
  | "unk4"
  | "unk5"
  | "unk6"
  | "vs_s_d"
  | "fileName"
  | "unk9"
  | "vs_s_l"
  | "unk11"
  | "unk13"
  | "unk14"
  | "unk15"
  | "uniqueIndex"
  | "vs_sn"
  | "unk18";

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "none", label: "No sort" },
  { value: "index", label: "Index (min → max)" },
  { value: "id", label: "ID (positive → negative)" },
  { value: "unk1", label: "unk1 (min → max)" },
  { value: "unk2", label: "unk2 (min → max)" },
  { value: "unk3", label: "unk3 (min → max)" },
  { value: "unk4", label: "unk4 (min → max)" },
  { value: "unk5", label: "unk5 (min → max)" },
  { value: "unk6", label: "unk6 (min → max)" },
  { value: "vs_s_d", label: "vs_s_d (min → max)" },
  { value: "fileName", label: "fileName (min → max)" },
  { value: "unk9", label: "unk9 (min → max)" },
  { value: "vs_s_l", label: "vs_s_l (min → max)" },
  { value: "unk11", label: "unk11 (min → max)" },
  { value: "unk13", label: "unk13 (min → max)" },
  { value: "unk14", label: "unk14 (min → max)" },
  { value: "unk15", label: "unk15 (min → max)" },
  { value: "uniqueIndex", label: "uniqueIndex (min → max)" },
  { value: "vs_sn", label: "vs_sn (min → max)" },
  { value: "unk18", label: "unk18 (min → max)" },
];

interface StageListProps {
  stageData: StageDataEntry[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onDelete: (index: number) => void;
  sortKey?: SortKey;
  onSortKeyChange?: (key: SortKey) => void;
  searchInputValue?: string;
  searchTerm?: string;
  onSearchInputChange?: (value: string) => void;
  onSearchTermChange?: (value: string) => void;
  isComposing?: boolean;
  onComposingChange?: (value: boolean) => void;
}

export function StageList({
  stageData,
  selectedIndex,
  onSelect,
  onDelete,
  sortKey: controlledSortKey,
  onSortKeyChange,
  searchInputValue: controlledInputValue,
  searchTerm: controlledSearchTerm,
  onSearchInputChange,
  onSearchTermChange,
  isComposing: controlledIsComposing,
  onComposingChange,
}: StageListProps) {
  const [internalInputValue, setInternalInputValue] = useState("");
  const [internalSearchTerm, setInternalSearchTerm] = useState("");
  const [internalIsComposing, setInternalIsComposing] = useState(false);
  const [internalSortKey, setInternalSortKey] = useState<SortKey>("unk1");

  const isControlled =
    onSortKeyChange != null &&
    onSearchInputChange != null &&
    onSearchTermChange != null &&
    onComposingChange != null;

  const sortKey = isControlled ? (controlledSortKey ?? "unk1") : internalSortKey;
  const inputValue = isControlled ? (controlledInputValue ?? "") : internalInputValue;
  const searchTerm = isControlled ? (controlledSearchTerm ?? "") : internalSearchTerm;
  const isComposing = isControlled ? (controlledIsComposing ?? false) : internalIsComposing;

  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [, startTransition] = useTransition();

  const handleInputChange = useCallback(
    (value: string) => {
      if (isControlled && onSearchInputChange) {
        onSearchInputChange(value);
        if (!(controlledIsComposing ?? false)) {
          startTransition(() => onSearchTermChange?.(value));
        }
      } else {
        setInternalInputValue(value);
        if (!internalIsComposing) {
          startTransition(() => setInternalSearchTerm(value));
        }
      }
    },
    [isControlled, onSearchInputChange, onSearchTermChange, controlledIsComposing, internalIsComposing]
  );

  const handleCompositionStart = useCallback(() => {
    if (isControlled && onComposingChange) {
      onComposingChange(true);
    } else {
      setInternalIsComposing(true);
    }
  }, [isControlled, onComposingChange]);

  const handleCompositionEnd = useCallback(
    (e: React.CompositionEvent<HTMLInputElement>) => {
      const value = (e.target as HTMLInputElement).value;
      if (isControlled && onComposingChange && onSearchTermChange) {
        onComposingChange(false);
        startTransition(() => onSearchTermChange(value));
      } else {
        setInternalIsComposing(false);
        startTransition(() => setInternalSearchTerm(value));
      }
    },
    [isControlled, onComposingChange, onSearchTermChange]
  );

  const listParentRef = useRef<HTMLDivElement | null>(null);
  const getListScrollElement = useCallback(() => listParentRef.current, []);
  const estimateRowSize = useCallback(() => 80, []);

  const filteredRows = useMemo(() => {
    const term = deferredSearchTerm.trim();
    if (!term) return stageData.map((row, idx) => ({ row, idx }));
    const lower = term.toLowerCase();
    return stageData
      .map((row, idx) => ({ row, idx }))
      .filter(({ row, idx }) => {
        const parts = [
          idx.toString(),
          String(row.id ?? ""),
          String(row.unk1),
          String(row.unk2),
          String(row.unk3),
          String(row.unk4),
          String(row.name?.Utf8String ?? ""),
        ];
        return parts.some((p) => p.toLowerCase().includes(lower));
      });
  }, [stageData, deferredSearchTerm]);

  const sortedRows = useMemo(() => {
    if (sortKey === "none") return filteredRows;

    const getValue = (row: StageDataEntry, idx: number): number => {
      switch (sortKey) {
        case "index":
          return idx;
        case "id":
          return row.id ?? 0;
        case "unk1":
          return row.unk1 ?? 0;
        case "unk2":
          return row.unk2 ?? 0;
        case "unk3":
          return row.unk3 ?? 0;
        case "unk4":
          return row.unk4 ?? 0;
        case "unk5":
          return row.unk5 ?? 0;
        case "unk6":
          return row.unk6 ?? 0;
        case "vs_s_d":
          return row.vs_s_d ?? 0;
        case "fileName":
          return row.fileName ?? 0;
        case "unk9":
          return row.unk9 ?? 0;
        case "vs_s_l":
          return row.vs_s_l ?? 0;
        case "unk11":
          return row.unk11 ?? 0;
        case "unk13":
          return row.unk13 ?? 0;
        case "unk14":
          return row.unk14 ?? 0;
        case "unk15":
          return row.unk15 ?? 0;
        case "uniqueIndex":
          return row.uniqueIndex ?? 0;
        case "vs_sn":
          return row.vs_sn ?? 0;
        case "unk18":
          return row.unk18 ?? 0;
        default:
          return idx;
      }
    };

    const compare = (a: { row: StageDataEntry; idx: number }, b: { row: StageDataEntry; idx: number }) => {
      const av = getValue(a.row, a.idx);
      const bv = getValue(b.row, b.idx);

      if (sortKey === "id") {
        const aIsPositive = av >= 0;
        const bIsPositive = bv >= 0;
        if (aIsPositive !== bIsPositive) return aIsPositive ? -1 : 1;
      }

      if (av !== bv) return av - bv;
      return a.idx - b.idx;
    };

    return [...filteredRows].sort(compare);
  }, [filteredRows, sortKey]);

  const rowVirtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: getListScrollElement,
    estimateSize: estimateRowSize,
    overscan: 10,
  });

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="grid items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Search by id, name, or unk..."
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            className="pl-10 h-8"
          />
        </div>
        <div className="relative flex-1 min-w-0">
          <Select
            value={sortKey}
            onValueChange={(v) => {
              const key = v as SortKey;
              if (isControlled && onSortKeyChange) {
                startTransition(() => onSortKeyChange(key));
              } else {
                startTransition(() => setInternalSortKey(key));
              }
            }}
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Sort..." />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {searchTerm.trim() && (
        <div className="text-xs text-muted-foreground mb-2">
          Found {filteredRows.length} of {stageData.length} stages
        </div>
      )}

      <div
        ref={listParentRef}
        className={cn(
          "flex-1 min-h-0 overflow-auto",
          sortedRows.length === 0 && "border rounded-md"
        )}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualItem) => {
            const item = sortedRows[virtualItem.index];
            if (!item) return null;
            const { row, idx } = item;

            return (
              <div
                key={virtualItem.key}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                  paddingRight: "0.25rem",
                }}
              >
                <StageCard
                  stage={row}
                  index={idx}
                  isSelected={idx === selectedIndex}
                  onClick={() => onSelect(idx)}
                  onDelete={() => onDelete(idx)}
                />
              </div>
            );
          })}
        </div>

        {sortedRows.length === 0 && (
          <div className="text-center text-muted-foreground py-8 text-sm">
            {searchTerm.trim()
              ? `No stages found matching "${searchTerm.trim()}"`
              : "No stages available"}
          </div>
        )}
      </div>
    </div>
  );
}