import { useVirtualizer } from "@tanstack/react-virtual";
import { FC, useCallback, useDeferredValue, useMemo, useRef, useState } from "react";
import { CharacterDataOB } from "../../../models/characterListOB";
import { CharacterCard } from "./CharacterCard";
import { Input } from "../../../components/ui/input";
import { Search } from "lucide-react";

interface CharacterListProps {
  characters: CharacterDataOB[];
  selectedIndex: number;
  onSelect: (character: CharacterDataOB, index: number) => void;
  onDelete: (index: number) => void;
  onCopy: (index: number) => void;
}

export const CharacterList: FC<CharacterListProps> = ({
  characters,
  selectedIndex,
  onSelect,
  onDelete,
  onCopy,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const filteredCharacters = useMemo(() => {
    const normalizedSearchTerm = deferredSearchTerm.trim();
    if (!normalizedSearchTerm) {
      return characters.map((character, index) => ({ character, originalIndex: index }));
    }

    return characters
      .map((character, index) => ({ character, originalIndex: index }))
      .filter(({ character }) =>
        character.CharacterId.toString().includes(normalizedSearchTerm)
      );
  }, [characters, deferredSearchTerm]);

  const getScrollElement = useCallback(() => scrollRef.current, []);
  const rowVirtualizer = useVirtualizer({
    count: filteredCharacters.length,
    getScrollElement,
    estimateSize: () => 94,
    getItemKey: (index) => {
      const item = filteredCharacters[index];
      return item ? `${item.character.CharacterId}-${item.originalIndex}` : index;
    },
    overscan: 8,
  });

  const handleSelect = useCallback((character: CharacterDataOB, originalIndex: number) => {
    onSelect(character, originalIndex);
  }, [onSelect]);

  const handleDelete = useCallback((originalIndex: number) => {
    onDelete(originalIndex);
  }, [onDelete]);

  const handleCopy = useCallback((originalIndex: number) => {
    onCopy(originalIndex);
  }, [onCopy]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="relative mb-4 flex-shrink-0">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input
          placeholder="Search by Character ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {searchTerm.trim() && (
        <div className="text-sm text-muted-foreground mb-2 flex-shrink-0">
          Found {filteredCharacters.length} of {characters.length} characters
        </div>
      )}

      {filteredCharacters.length > 0 ? (
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto overscroll-contain">
          <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const item = filteredCharacters[virtualRow.index];
              if (!item) return null;
              const { character, originalIndex } = item;

              return (
                <div
                  key={virtualRow.key}
                  ref={rowVirtualizer.measureElement}
                  data-index={virtualRow.index}
                  className="absolute left-0 top-0 w-full px-1 pb-2 pr-3"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <CharacterCard
                    character={character}
                    index={originalIndex}
                    isSelected={originalIndex === selectedIndex}
                    onClick={() => handleSelect(character, originalIndex)}
                    onDelete={() => handleDelete(originalIndex)}
                    onCopy={() => handleCopy(originalIndex)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : searchTerm.trim() ? (
        <div className="py-8 text-center text-muted-foreground">
          No characters found matching "{searchTerm}"
        </div>
      ) : (
        <div className="py-8 text-center text-muted-foreground">
          No characters available
        </div>
      )}
    </div>
  );
};
