import { useCallback, useDeferredValue, useMemo, useRef, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { StageListEntry } from "@/models/stageListEntry";
import { cn } from "@/lib/utils";
import { StageCard } from "./StageCard";

export type StageListSortKey =
  | "none"
  | "index"
  | "entryId"
  | "recordLookupId"
  | "randomSelectWeightDefault"
  | "randomSelectWeightAlt"
  | "unk0x0c"
  | "seriesAltGroupId"
  | "unk0x14"
  | "vsSD"
  | "fileName"
  | "selectOrderAlt"
  | "vsSL"
  | "seriesDefaultGroupId"
  | "unk0x34"
  | "unk0x38"
  | "selectOrderDefault"
  | "vsSn"
  | "iconIndex";

type SortKey = StageListSortKey;

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "none", label: "No sort" },
  { value: "index", label: "Index (min → max)" },
  { value: "entryId", label: "ID (positive → negative)" },
  { value: "recordLookupId", label: "recordLookupId (min → max)" },
  { value: "randomSelectWeightDefault", label: "randomSelectWeightDefault (min → max)" },
  { value: "randomSelectWeightAlt", label: "randomSelectWeightAlt (min → max)" },
  { value: "unk0x0c", label: "unk0x0c (min → max)" },
  { value: "seriesAltGroupId", label: "seriesAltGroupId (min → max)" },
  { value: "unk0x14", label: "unk0x14 (min → max)" },
  { value: "vsSD", label: "vs_s_d (min → max)" },
  { value: "fileName", label: "fileName (min → max)" },
  { value: "selectOrderAlt", label: "selectOrderAlt (min → max)" },
  { value: "vsSL", label: "vs_s_l (min → max)" },
  { value: "seriesDefaultGroupId", label: "seriesDefaultGroupId (min → max)" },
  { value: "unk0x34", label: "unk0x34 (min → max)" },
  { value: "unk0x38", label: "unk0x38 (min → max)" },
  { value: "selectOrderDefault", label: "selectOrderDefault (min → max)" },
  { value: "vsSn", label: "vs_sn (min → max)" },
  { value: "iconIndex", label: "Icon Index (min → max)" },
];

interface StageListProps {
  stageData: StageListEntry[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onCopy: (index: number) => void;
  onDelete: (index: number) => void;
  sortKey?: SortKey;
  onSortKeyChange?: (key: SortKey) => void;
  searchInputValue?: string;
  searchTerm?: string;
  onSearchInputChange?: (value: string) => void;
  onSearchTermChange?: (value: string) => void;
  isComposing?: boolean;
  onComposingChange?: (value: boolean) => void;
  stageIconConvertDirPath?: string;
  stageIconBaseNameOrder?: Array<string | null>;
}

export function StageList({
  stageData,
  selectedIndex,
  onSelect,
  onCopy,
  onDelete,
  sortKey: controlledSortKey,
  onSortKeyChange,
  searchInputValue: controlledInputValue,
  searchTerm: controlledSearchTerm,
  onSearchInputChange,
  onSearchTermChange,
  isComposing: controlledIsComposing,
  onComposingChange,
  stageIconConvertDirPath,
  stageIconBaseNameOrder,
}: StageListProps) {
  const [internalInputValue, setInternalInputValue] = useState("");
  const [internalSearchTerm, setInternalSearchTerm] = useState("");
  const [internalIsComposing, setInternalIsComposing] = useState(false);
  const [internalSortKey, setInternalSortKey] = useState<SortKey>("recordLookupId");

  const isControlled =
    onSortKeyChange != null &&
    onSearchInputChange != null &&
    onSearchTermChange != null &&
    onComposingChange != null;

  const sortKey = isControlled ? (controlledSortKey ?? "recordLookupId") : internalSortKey;
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
  const estimateRowSize = useCallback(() => 96, []);

  const filteredRows = useMemo(() => {
    const term = deferredSearchTerm.trim();
    if (!term) return stageData.map((row, idx) => ({ row, idx }));
    const lower = term.toLowerCase();
    return stageData
      .map((row, idx) => ({ row, idx }))
      .filter(({ row, idx }) => {
        const parts = [
          idx.toString(),
          String(row.entryId ?? ""),
          String(row.recordLookupId),
          String(row.randomSelectWeightDefault),
          String(row.randomSelectWeightAlt),
          String(row.unk0x0c),
          String(row.name ?? ""),
        ];
        return parts.some((p) => p.toLowerCase().includes(lower));
      });
  }, [stageData, deferredSearchTerm]);

  const sortedRows = useMemo(() => {
    if (sortKey === "none") return filteredRows;

    const getValue = (row: StageListEntry, idx: number): number => {
      switch (sortKey) {
        case "index":
          return idx;
        case "entryId":
          return row.entryId ?? 0;
        case "recordLookupId":
          return row.recordLookupId ?? 0;
        case "randomSelectWeightDefault":
          return row.randomSelectWeightDefault ?? 0;
        case "randomSelectWeightAlt":
          return row.randomSelectWeightAlt ?? 0;
        case "unk0x0c":
          return row.unk0x0c ?? 0;
        case "seriesAltGroupId":
          return row.seriesAltGroupId ?? 0;
        case "unk0x14":
          return row.unk0x14 ?? 0;
        case "vsSD":
          return row.vsSD ?? 0;
        case "fileName":
          return row.fileName ?? 0;
        case "selectOrderAlt":
          return row.selectOrderAlt ?? 0;
        case "vsSL":
          return row.vsSL ?? 0;
        case "seriesDefaultGroupId":
          return row.seriesDefaultGroupId ?? 0;
        case "unk0x34":
          return row.unk0x34 ?? 0;
        case "unk0x38":
          return row.unk0x38 ?? 0;
        case "selectOrderDefault":
          return row.selectOrderDefault ?? 0;
        case "vsSn":
          return row.vsSn ?? 0;
        case "iconIndex":
          return row.iconIndex ?? 0;
        default:
          return idx;
      }
    };

    const compare = (a: { row: StageListEntry; idx: number }, b: { row: StageListEntry; idx: number }) => {
      const av = getValue(a.row, a.idx);
      const bv = getValue(b.row, b.idx);

      if (sortKey === "entryId") {
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
                  onCopy={() => onCopy(idx)}
                  onDelete={() => onDelete(idx)}
                  stageIconConvertDirPath={stageIconConvertDirPath}
                  stageIconBaseNameOrder={stageIconBaseNameOrder}
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