import { FC, useState } from "react";
import { CharacterDataOB, CharacterListOB } from "../../../models/characterListOB";
import { CharacterList } from "./CharacterList";
import { CharacterForm } from "./CharacterForm";
import { Button } from "../../../components/ui/button";
import { Plus } from "lucide-react";
import { Buffer } from "buffer";

interface CharacterEditorProps {
  characterListData?: CharacterListOB;
  onChange: (data: CharacterListOB) => void;
}

export const CharacterEditor: FC<CharacterEditorProps> = ({
  characterListData,
  onChange,
}) => {
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterDataOB | undefined>();
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  if (!characterListData) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Please load a character list file first
      </div>
    );
  }

  const handleSelectCharacter = (character: CharacterDataOB, index: number) => {
    setSelectedCharacter(character);
    setSelectedIndex(index);
  };

  const handleUpdateCharacter = (updatedCharacter: CharacterDataOB) => {
    if (selectedIndex >= 0) {
      const newCharacterData = [...characterListData.CharacterData];
      newCharacterData[selectedIndex] = updatedCharacter;
      
      // Create a proper CharacterListOB instance
      const updatedCharacterList = Object.assign(
        Object.create(Object.getPrototypeOf(characterListData)),
        characterListData,
        {
          CharacterData: newCharacterData,
        }
      );
      
      onChange(updatedCharacterList);
      setSelectedCharacter(updatedCharacter);
    }
  };

  const handleDeleteCharacter = (index: number) => {
    const newCharacterData = characterListData.CharacterData.filter((_, i) => i !== index);
    
    // Create a proper CharacterListOB instance
    const updatedCharacterList = Object.assign(
      Object.create(Object.getPrototypeOf(characterListData)),
      characterListData,
      {
        CharacterData: newCharacterData,
        CharacterCount: newCharacterData.length,
      }
    );
    
    onChange(updatedCharacterList);
    
    // Reset selection if deleted character was selected
    if (selectedIndex === index) {
      setSelectedCharacter(undefined);
      setSelectedIndex(-1);
    } else if (selectedIndex > index) {
      setSelectedIndex(selectedIndex - 1);
    }
  };

  const handleAddCharacter = () => {
    // Create a new character with default values
    const newCharacterId = Math.max(...characterListData.CharacterData.map(c => c.CharacterId), 0) + 1;
    const newCharacter = new CharacterDataOB(
      Buffer.alloc(0x2000), // Full buffer data
      Buffer.alloc(0x1d8), // Character info buffer
      newCharacterId
    );
    
    const newCharacterData = [...characterListData.CharacterData, newCharacter];
    
    // Create a proper CharacterListOB instance
    const updatedCharacterList = Object.assign(
      Object.create(Object.getPrototypeOf(characterListData)),
      characterListData,
      {
        CharacterData: newCharacterData,
        CharacterCount: newCharacterData.length,
      }
    );
    
    onChange(updatedCharacterList);
    
    // Select the new character
    const newIndex = newCharacterData.length - 1;
    setSelectedCharacter(newCharacter);
    setSelectedIndex(newIndex);
  };

  return (
    <div className="flex h-[80vh] gap-4">
      {/* Left Panel - Character List */}
      <div className="w-1/3 border rounded-lg p-4 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Characters ({characterListData.CharacterCount})</h3>
          <Button onClick={handleAddCharacter} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Add
          </Button>
        </div>
        
        <CharacterList
          characters={characterListData.CharacterData}
          selectedIndex={selectedIndex}
          onSelect={handleSelectCharacter}
          onDelete={handleDeleteCharacter}
        />
      </div>

      {/* Right Panel - Character Form */}
      <div className="flex-1 border rounded-lg p-4 overflow-hidden">
        {selectedCharacter ? (
          <CharacterForm
            character={selectedCharacter}
            characterId={selectedCharacter.CharacterId}
            onChange={handleUpdateCharacter}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Select a character to edit
          </div>
        )}
      </div>
    </div>
  );
};
