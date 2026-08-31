import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { CircleXIcon, Search } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CharacterListEntry } from "@/models/characterListEntry";
import { cn } from "@/lib/utils";
import { CharacterCard } from "./CharacterCard";
import {
  loadCharacterListHighlights,
  saveCharacterListHighlights,
} from "./characterListHighlightCache";
import { filterCharacterListRows, normalizeCharacterHighlightId } from "./characterListSearch";

interface CharacterListProps {
  characters: CharacterListEntry[];
  selectedIndex: number;
  sourceFilePath?: string;
  cardIconConvertDirPath?: string;
  cardIconNameOrder?: Array<string | null>;
  onSelect: (index: number) => void;
  onDelete: (index: number) => void;
  onCopy: (index: number) => void;
}

export function CharacterList({
  characters,
  selectedIndex,
  sourceFilePath,
  cardIconConvertDirPath,
  cardIconNameOrder,
  onSelect,
  onDelete,
  onCopy,
}: CharacterListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const inputRef = useRef<HTMLInputElement>(null);
  const [highlightedEntryIds, setHighlightedEntryIds] = useState<Set<number>>(() => {
    if (!sourceFilePath?.trim()) return new Set();
    return new Set(loadCharacterListHighlights(sourceFilePath));
  });

  const listParentRef = useRef<HTMLDivElement | null>(null);
  const getListScrollElement = useCallback(() => listParentRef.current, []);
  const estimateRowSize = useCallback(() => 96, []);

  const lastSelectedIndexRef = useRef<number>(-1);
  useEffect(() => {
    if (selectedIndex >= 0) lastSelectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  useEffect(() => {
    if (!sourceFilePath?.trim()) {
      setHighlightedEntryIds(new Set());
      return;
    }
    setHighlightedEntryIds(new Set(loadCharacterListHighlights(sourceFilePath)));
  }, [sourceFilePath]);

  const persistHighlightedEntryIds = useCallback(
    (next: Set<number>) => {
      if (!sourceFilePath?.trim()) return;
      saveCharacterListHighlights(sourceFilePath, next);
    },
    [sourceFilePath],
  );

  const toggleHighlight = useCallback(
    (entryId: number) => {
      setHighlightedEntryIds((prev) => {
        const id = normalizeCharacterHighlightId(entryId);
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        persistHighlightedEntryIds(next);
        return next;
      });
    },
    [persistHighlightedEntryIds],
  );

  const filteredRows = useMemo(
    () => filterCharacterListRows(characters, deferredSearchTerm, highlightedEntryIds),
    [characters, deferredSearchTerm, highlightedEntryIds],
  );

  const rowVirtualizer = useVirtualizer({
    count: filteredRows.length,
    getScrollElement: getListScrollElement,
    estimateSize: estimateRowSize,
    overscan: 10,
  });

  const prevHasDeferredSearchRef = useRef(false);
  useEffect(() => {
    const hasDeferredSearch = deferredSearchTerm.trim().length > 0;
    const prevHasDeferredSearch = prevHasDeferredSearchRef.current;
    prevHasDeferredSearchRef.current = hasDeferredSearch;

    if (!prevHasDeferredSearch || hasDeferredSearch) return;

    const targetIndex = lastSelectedIndexRef.current;
    if (targetIndex < 0 || targetIndex >= characters.length) return;
    const virtualIndex = filteredRows.findIndex((item) => item.idx === targetIndex);
    if (virtualIndex < 0) return;

    requestAnimationFrame(() => {
      rowVirtualizer.scrollToIndex(virtualIndex, { align: "center" });
    });
  }, [characters.length, deferredSearchTerm, filteredRows, rowVirtualizer]);

  const handleClearInput = useCallback(() => {
    setSearchTerm("");
    inputRef.current?.focus();
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input
          ref={inputRef}
          placeholder="Search by Character ID or string fields..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 pr-8 h-8"
        />
        {searchTerm.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleClearInput}
            className="text-muted-foreground focus-visible:ring-ring/50 absolute inset-y-0 right-0 rounded-l-none hover:bg-transparent"
          >
            <CircleXIcon className="w-4 h-4" />
            <span className="sr-only">Clear input</span>
          </Button>
        )}
      </div>

      {searchTerm.trim() && (
        <div className="text-xs text-muted-foreground mb-2">
          Found {filteredRows.length} of {characters.length} characters
          {highlightedEntryIds.size > 0 ? ` · Star ${highlightedEntryIds.size} pinned` : ""}
        </div>
      )}

      <div ref={listParentRef} className={cn("flex-1 min-h-0 overflow-auto", filteredRows.length === 0 && "border rounded-md")}>
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualItem) => {
            const item = filteredRows[virtualItem.index];
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
                <CharacterCard
                  character={row}
                  index={idx}
                  cardIconConvertDirPath={cardIconConvertDirPath}
                  cardIconNameOrder={cardIconNameOrder}
                  isSelected={idx === selectedIndex}
                  isHighlighted={highlightedEntryIds.has(normalizeCharacterHighlightId(row.entryId))}
                  onClick={() => onSelect(idx)}
                  onDelete={() => onDelete(idx)}
                  onCopy={() => onCopy(idx)}
                  onToggleHighlight={() => toggleHighlight(row.entryId)}
                />
              </div>
            );
          })}
        </div>

        {filteredRows.length === 0 && (
          <div className="text-center text-muted-foreground py-8 text-sm">
            {searchTerm.trim() ? `No characters found matching "${searchTerm.trim()}"` : "No characters available"}
          </div>
        )}
      </div>
    </div>
  );
}
