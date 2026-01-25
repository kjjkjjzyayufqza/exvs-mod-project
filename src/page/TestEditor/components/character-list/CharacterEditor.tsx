import { useCallback, useMemo, useState } from "react";
import { Buffer } from "buffer";
import { Plus } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { CharacterDataOB, CharacterListOB } from "@/models/characterListOB";
import { CharacterDataOB as CharacterDataOBClass } from "@/models/characterListOB";
import { cloneCharacterDataOB } from "@/module/commonFunc";
import { CharacterForm } from "./CharacterForm";
import { CharacterList } from "./CharacterList";
import type { SeriesIdPickerItem } from "./SeriesIdPickerPopover";
import type { CardIconIndexPickerItem } from "./CardIconIndexPickerPopover";

interface CharacterEditorProps {
  characterListData?: CharacterListOB;
  selectedIndex?: number;
  seriesIdPickerItems: SeriesIdPickerItem[];
  seriesIdPickerLoading?: boolean;
  seriesIdPickerError?: string | null;
  cardIconConvertDirPath?: string;
  cardIconNameOrder?: Array<string | null>;
  cardIconIndexPickerItems: CardIconIndexPickerItem[];
  cardIconIndexPickerLoading?: boolean;
  cardIconIndexPickerError?: string | null;
  onChange: (data: CharacterListOB) => void;
  onSelectChange?: (index: number) => void;
}

export function CharacterEditor({
  characterListData,
  selectedIndex: controlledSelectedIndex,
  seriesIdPickerItems,
  seriesIdPickerLoading,
  seriesIdPickerError,
  cardIconConvertDirPath,
  cardIconNameOrder,
  cardIconIndexPickerItems,
  cardIconIndexPickerLoading,
  cardIconIndexPickerError,
  onChange,
  onSelectChange,
}: CharacterEditorProps) {
  const [internalSelectedIndex, setInternalSelectedIndex] = useState<number>(-1);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteCandidateIndex, setDeleteCandidateIndex] = useState<number | null>(null);

  const isControlled = controlledSelectedIndex !== undefined && onSelectChange !== undefined;
  const selectedIndex = isControlled ? controlledSelectedIndex : internalSelectedIndex;

  const getNextCharacterUniqueId = useCallback(() => {
    if (!characterListData) return 1;
    return Math.max(...characterListData.CharacterData.map((c) => c.characterUniqueId || 0), 0) + 1;
  }, [characterListData]);

  const selectedCharacter = useMemo<CharacterDataOB | null>(() => {
    if (!characterListData) return null;
    if (selectedIndex < 0) return null;
    return characterListData.CharacterData[selectedIndex] ?? null;
  }, [characterListData, selectedIndex]);

  const deleteCandidateCharacter = useMemo<CharacterDataOB | null>(() => {
    if (!characterListData) return null;
    if (deleteCandidateIndex === null) return null;
    return characterListData.CharacterData[deleteCandidateIndex] ?? null;
  }, [characterListData, deleteCandidateIndex]);

  const updateList = useCallback(
    (updater: (prev: CharacterListOB) => CharacterListOB) => {
      if (!characterListData) return;
      const next = updater(characterListData);
      onChange(next);
    },
    [characterListData, onChange]
  );

  const handleSelect = useCallback((index: number) => {
    if (isControlled) {
      onSelectChange?.(index);
    } else {
      setInternalSelectedIndex(index);
    }
  }, [isControlled, onSelectChange]);

  const handleUpdateCharacter = useCallback(
    (updatedCharacter: CharacterDataOB) => {
      if (!characterListData) return;
      if (selectedIndex < 0) return;

      updateList((prevList) => {
        const nextRows = [...prevList.CharacterData];
        if (!nextRows[selectedIndex]) return prevList;
        nextRows[selectedIndex] = updatedCharacter;
        return Object.assign(Object.create(Object.getPrototypeOf(prevList)), prevList, {
          CharacterData: nextRows,
          CharacterCount: nextRows.length,
        });
      });
    },
    [characterListData, selectedIndex, updateList]
  );

  const openDeleteDialog = useCallback((index: number) => {
    setDeleteCandidateIndex(index);
    setDeleteDialogOpen(true);
  }, []);

  const closeDeleteDialog = useCallback(() => {
    setDeleteDialogOpen(false);
    setDeleteCandidateIndex(null);
  }, []);

  const confirmDelete = useCallback(() => {
    if (!characterListData) return;
    if (deleteCandidateIndex === null) return;

    updateList((prevList) => {
      const nextRows = prevList.CharacterData.filter((_, i) => i !== deleteCandidateIndex);
      return Object.assign(Object.create(Object.getPrototypeOf(prevList)), prevList, {
        CharacterData: nextRows,
        CharacterCount: nextRows.length,
      });
    });

    const nextSelectedIndex = (() => {
      if (selectedIndex === deleteCandidateIndex) return -1;
      if (selectedIndex > deleteCandidateIndex) return selectedIndex - 1;
      return selectedIndex;
    })();

    if (isControlled) {
      onSelectChange?.(nextSelectedIndex);
    } else {
      setInternalSelectedIndex(nextSelectedIndex);
    }

    closeDeleteDialog();
  }, [characterListData, closeDeleteDialog, deleteCandidateIndex, updateList]);

  const handleCopy = useCallback(
    (index: number) => {
      if (!characterListData) return;
      const characterToCopy = characterListData.CharacterData[index];
      if (!characterToCopy) return;

      const newCharacterId = characterToCopy.CharacterId + 1;

      const newCharacterUniqueId = getNextCharacterUniqueId();
      const clonedCharacter = cloneCharacterDataOB(characterToCopy, newCharacterId, characterListData.bufferData, newCharacterUniqueId);

      updateList((prevList) => {
        const nextRows = [...prevList.CharacterData, clonedCharacter];
        return Object.assign(Object.create(Object.getPrototypeOf(prevList)), prevList, {
          CharacterData: nextRows,
          CharacterCount: nextRows.length,
        });
      });

      const nextIndex = characterListData.CharacterData.length;
      if (isControlled) {
        onSelectChange?.(nextIndex);
      } else {
        setInternalSelectedIndex(nextIndex);
      }
    },
    [characterListData, getNextCharacterUniqueId, isControlled, onSelectChange, updateList]
  );

  const handleAdd = useCallback(() => {
    if (!characterListData) return;
    const newCharacterId = Math.max(...characterListData.CharacterData.map((c) => c.CharacterId), 0) + 1;
    const newCharacter = new CharacterDataOBClass(Buffer.alloc(0x2000), Buffer.alloc(0x1d8), newCharacterId);
    newCharacter.characterUniqueId = getNextCharacterUniqueId();

    updateList((prevList) => {
      const nextRows = [...prevList.CharacterData, newCharacter];
      return Object.assign(Object.create(Object.getPrototypeOf(prevList)), prevList, {
        CharacterData: nextRows,
        CharacterCount: nextRows.length,
      });
    });

    const nextIndex = characterListData.CharacterData.length;
    if (isControlled) {
      onSelectChange?.(nextIndex);
    } else {
      setInternalSelectedIndex(nextIndex);
    }
  }, [characterListData, getNextCharacterUniqueId, isControlled, onSelectChange, updateList]);

  if (!characterListData) {
    return <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">Select this tab to load character_list.bin</div>;
  }

  return (
    <div className="flex h-full gap-4 min-h-0">
      <div className="w-1/3 border rounded-lg p-3 overflow-hidden flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold text-sm">Characters ({characterListData.CharacterData.length})</div>
          <Button size="sm" onClick={handleAdd} className="inline-flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add
          </Button>
        </div>

        <CharacterList
          characters={characterListData.CharacterData}
          selectedIndex={selectedIndex}
          cardIconConvertDirPath={cardIconConvertDirPath}
          cardIconNameOrder={cardIconNameOrder}
          onSelect={handleSelect}
          onDelete={openDeleteDialog}
          onCopy={handleCopy}
        />
      </div>

      <div className="flex-1 border rounded-lg p-4 overflow-hidden flex flex-col min-h-0">
        {selectedCharacter ? (
          <CharacterForm
            character={selectedCharacter}
            characterId={selectedCharacter.CharacterId}
            seriesIdPickerItems={seriesIdPickerItems}
            seriesIdPickerLoading={seriesIdPickerLoading}
            seriesIdPickerError={seriesIdPickerError}
            cardIconIndexPickerItems={cardIconIndexPickerItems}
            cardIconIndexPickerLoading={cardIconIndexPickerLoading}
            cardIconIndexPickerError={cardIconIndexPickerError}
            onChange={handleUpdateCharacter}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Select a character to edit</div>
        )}
      </div>

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (open) {
            setDeleteDialogOpen(true);
            return;
          }
          closeDeleteDialog();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Character</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteCandidateCharacter ? (
                <>
                  Are you sure you want to delete Character ID {deleteCandidateCharacter.CharacterId} (index {deleteCandidateIndex})?
                </>
              ) : (
                <>Are you sure you want to delete this character? This action cannot be undone.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={closeDeleteDialog}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}



