import { FC, useState, useMemo } from "react";
import { CharacterDataOB } from "../../../models/characterListOB";
import { CharacterCard } from "./CharacterCard";
import { ScrollArea } from "../../../components/ui/scroll-area";
import { Input } from "../../../components/ui/input";
import { Search } from "lucide-react";

interface CharacterListProps {
  characters: CharacterDataOB[];
  selectedIndex: number;
  onSelect: (character: CharacterDataOB, index: number) => void;
  onDelete: (index: number) => void;
}

export const CharacterList: FC<CharacterListProps> = ({
  characters,
  selectedIndex,
  onSelect,
  onDelete,
}) => {
  const [searchTerm, setSearchTerm] = useState("");

  // Filter characters based on search term
  const filteredCharacters = useMemo(() => {
    if (!searchTerm.trim()) {
      return characters.map((character, index) => ({ character, originalIndex: index }));
    }

    return characters
      .map((character, index) => ({ character, originalIndex: index }))
      .filter(({ character }) => 
        character.CharacterId.toString().includes(searchTerm.trim())
      );
  }, [characters, searchTerm]);

  const handleSelect = (character: CharacterDataOB, originalIndex: number) => {
    onSelect(character, originalIndex);
  };

  const handleDelete = (originalIndex: number) => {
    onDelete(originalIndex);
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Search Box */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input
          placeholder="Search by Character ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Results Info */}
      {searchTerm.trim() && (
        <div className="text-sm text-muted-foreground mb-2">
          Found {filteredCharacters.length} of {characters.length} characters
        </div>
      )}

      {/* Character List */}
      <ScrollArea className="flex-1">
        <div className="space-y-2">
          {filteredCharacters.length > 0 ? (
            filteredCharacters.map(({ character, originalIndex }) => (
              <CharacterCard
                key={`${character.CharacterId}-${originalIndex}`}
                character={character}
                index={originalIndex}
                isSelected={originalIndex === selectedIndex}
                onClick={() => handleSelect(character, originalIndex)}
                onDelete={() => handleDelete(originalIndex)}
              />
            ))
          ) : searchTerm.trim() ? (
            <div className="text-center text-muted-foreground py-8">
              No characters found matching "{searchTerm}"
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-8">
              No characters available
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
