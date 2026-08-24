import { useCallback, useMemo, useState } from "react";
import { Copy, Plus } from "lucide-react";

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
import type { CharacterListData, CharacterListEntry } from "@/models/characterListEntry";
import { CharacterForm } from "./CharacterForm";
import { CharacterList } from "./CharacterList";
import { pickNextCharacterUniqueId } from "./characterUniqueId";
import type { SeriesIdPickerItem } from "./SeriesIdPickerPopover";
import type { CardIconIndexPickerItem } from "./CardIconIndexPickerPopover";
import type { BgmCuePickerItem } from "./BgmCuePickerPopover";
import { CloneGuiDialog } from "./CloneGuiDialog";
import type { CloneGuiSetResult } from "./guiClonePlan";
import type { GuiPackPickerItem } from "./guiPackIndex";
import type { TestEditorWorkspaceDocument, WorkspacePackIdentity } from "@/services/testEditorWorkspace/types";

interface CharacterEditorProps {
  characterListData?: CharacterListData;
  selectedIndex?: number;
  seriesIdPickerItems: SeriesIdPickerItem[];
  seriesIdPickerLoading?: boolean;
  seriesIdPickerError?: string | null;
  cardIconConvertDirPath?: string;
  cardIconNameOrder?: Array<string | null>;
  cardIconIndexPickerItems: CardIconIndexPickerItem[];
  cardIconIndexPickerLoading?: boolean;
  cardIconIndexPickerError?: string | null;
  bgmCuePickerItems?: BgmCuePickerItem[];
  bgmCuePickerLoading?: boolean;
  bgmCuePickerError?: string | null;
  guiPackItems?: GuiPackPickerItem[];
  guiPackLoading?: boolean;
  guiPackError?: string | null;
  onOpenGuiPackFolder?: (hash: number) => void;
  jumpToCharacterIdTable?: {
    disabled: boolean;
    tooltip: string;
    onClick: () => void;
  };
  cloneGuiWritable?: boolean;
  onPackMutated?: (pack: WorkspacePackIdentity) => void;
  onRevealTreeFolder?: (path: string) => void;
  onJumpToNaviList?: (uniqueId: number) => void;
  onCloneApplied?: () => void;
  workspaceDocument?: TestEditorWorkspaceDocument;
  onChange: (data: CharacterListData) => void;
  onSelectChange?: (index: number) => void;
}

function createEmptyEntry(entryId: number, uniqueId: number): CharacterListEntry {
  return {
    entryId,
    indexInSeries: 0,
    legacyRemovedU320004: 0,
    chargeLabelWeaponFight: 0,
    vsPLC03: 0,
    msIghR: 0,
    msVsR: 0,
    unkHash0x18: 0,
    characterName: "",
    threshold300ScoreCode: 0,
    threshold200RuleCode: 0,
    threshold100RuleCode: 0,
    unkHash0x30: 0,
    msVsL: 0,
    threshold400RuleCode: 0,
    profileSetAPrimaryDefault: 0,
    profileSetBPrimarySlot2: 0,
    vsPRC03: 0,
    profileSetASharedSpecial: 0,
    profileSetBPrimaryDefault: 0,
    profileSetBPrimarySlot1: 0,
    seriesAltGroupId: 0,
    profileSetBSecondarySlot3: 0,
    sticker1: 0,
    unk0x060: 0,
    profileSetAPrimarySlot2: 0,
    variantDisplayNameDefault: "",
    unk0x070: 0,
    pilotPresentationHash: 0,
    lmbPilotClothing: 0,
    variantDisplayNameSlot4: "",
    weaponTextSfight: "",
    optionalSidecarHashSlot2: 0,
    weaponTextMain: "",
    variantDisplayNameSlot3: "",
    optionalPilotPresentationHashSlot2: 0,
    pilotNameShort: "",
    secondarySelectorState: 0,
    exPilotClothingLmbHash: 0,
    seriesId: 0,
    weaponTextSp: "",
    pilotNameFull: "",
    legacySparseWeaponInfoFlag: 0,
    profileSetAPrimarySlot0: 0,
    vsPRC02: 0,
    msCardIconIndex: 0,
    profileSetASecondaryDefault: 0,
    unk0x0dc: 0,
    stickerT01: 0,
    profileSetBSecondaryDefault: 0,
    profileSetBPrimarySlot0: 0,
    selectorState: 0,
    seriesDefaultGroupId: 0,
    vsPLC02: 0,
    profileSetBSharedSpecial: 0,
    unk0x0fc: 0,
    legacyRemovedU320100: 0,
    suppressOptionalLmbSidecar: 0,
    variantFlag: 0,
    threshold1RuleCode: 0,
    unk0x110: 0,
    msTracker: 0,
    profileSetASecondarySlot1: 0,
    vsPLC04: 0,
    profileSetBSecondarySlot2: 0,
    unk0x124: 0,
    profileSetAPrimarySlot3: 0,
    optionalSidecarHashSlot3: 0,
    profileSetBSecondarySlot1: 0,
    weaponTextFight: "",
    pairedBgmMusicIdPrimary: 0,
    characterUniqueId: uniqueId,
    variantDisplayNameSlot1: "",
    profileSetASecondarySlot2: 0,
    chargeLabelWeaponMain: 0,
    profileSetBPrimarySlot3: 0,
    variantDisplayNameSlot5: "",
    lmbCutIn: 0,
    stickerT05: 0,
    seriesAltOrderIndex: 0,
    trackerStickerHashSlot4: 0,
    pairedBgmMusicIdSecondary: 0,
    unk0x174: 0,
    vsPRC04: 0,
    trackerStickerHashSlot3: 0,
    msMsL: 0,
    unk0x184: 0,
    vsPR: 0,
    weaponTextSub: "",
    lmbBoost: 0,
    profileSetASecondarySlot0: 0,
    variantDisplayNameSlot6: "",
    rnkML: 0,
    optionalPresentationVariantFlag: 0,
    msCrs: 0,
    variantDisplayNameSlot2: "",
    optionalPilotPresentationHashSlot3: 0,
    profileSetBSecondarySlot0: 0,
    msMsS: 0,
    vsPL: 0,
    unk0x1c8: 0,
    msMn: 0,
    scP: 0,
    partnerCommEntryEnabledCode: 0,
  };
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
  bgmCuePickerItems,
  bgmCuePickerLoading,
  bgmCuePickerError,
  guiPackItems,
  guiPackLoading,
  guiPackError,
  onOpenGuiPackFolder,
  jumpToCharacterIdTable,
  cloneGuiWritable = true,
  onPackMutated,
  onRevealTreeFolder,
  onJumpToNaviList,
  onCloneApplied,
  workspaceDocument,
  onChange,
  onSelectChange,
}: CharacterEditorProps) {
  const [internalSelectedIndex, setInternalSelectedIndex] = useState<number>(-1);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteCandidateIndex, setDeleteCandidateIndex] = useState<number | null>(null);
  const [cloneGuiOpen, setCloneGuiOpen] = useState(false);
  const [formSyncKey, setFormSyncKey] = useState(0);

  const isControlled = controlledSelectedIndex !== undefined && onSelectChange !== undefined;
  const selectedIndex = isControlled ? controlledSelectedIndex : internalSelectedIndex;

  const entries = characterListData?.entries ?? [];

  const uniqueIdEntries = useMemo(
    () =>
      entries.map((entry) => ({
        entryId: entry.entryId,
        characterUniqueId: entry.characterUniqueId || 0,
      })),
    [entries],
  );

  const getNextCharacterUniqueId = useCallback(
    () => pickNextCharacterUniqueId(uniqueIdEntries),
    [uniqueIdEntries],
  );

  const selectedCharacter = useMemo<CharacterListEntry | null>(() => {
    if (selectedIndex < 0) return null;
    return entries[selectedIndex] ?? null;
  }, [entries, selectedIndex]);

  const deleteCandidateCharacter = useMemo<CharacterListEntry | null>(() => {
    if (deleteCandidateIndex === null) return null;
    return entries[deleteCandidateIndex] ?? null;
  }, [entries, deleteCandidateIndex]);

  const updateList = useCallback(
    (updater: (prev: CharacterListData) => CharacterListData) => {
      if (!characterListData) return;
      onChange(updater(characterListData));
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
    (updatedCharacter: CharacterListEntry) => {
      if (!characterListData) return;
      if (selectedIndex < 0) return;

      updateList((prev) => {
        const nextEntries = [...prev.entries];
        if (!nextEntries[selectedIndex]) return prev;
        nextEntries[selectedIndex] = updatedCharacter;
        return { ...prev, entries: nextEntries };
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

    updateList((prev) => ({
      ...prev,
      entries: prev.entries.filter((_, i) => i !== deleteCandidateIndex),
    }));

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
  }, [characterListData, closeDeleteDialog, deleteCandidateIndex, isControlled, onSelectChange, selectedIndex, updateList]);

  const handleCopy = useCallback(
    (index: number) => {
      if (!characterListData) return;
      const src = entries[index];
      if (!src) return;

      const newEntryId = src.entryId + 1;
      const newUniqueId = getNextCharacterUniqueId();
      const cloned: CharacterListEntry = { ...src, entryId: newEntryId, characterUniqueId: newUniqueId };

      updateList((prev) => ({
        ...prev,
        entries: [...prev.entries, cloned],
      }));

      const nextIndex = entries.length;
      if (isControlled) {
        onSelectChange?.(nextIndex);
      } else {
        setInternalSelectedIndex(nextIndex);
      }
    },
    [characterListData, entries, getNextCharacterUniqueId, isControlled, onSelectChange, updateList]
  );

  const handleCloneGuiApplied = useCallback(
    (next: CharacterListData, _result: CloneGuiSetResult) => {
      onChange(next);
      setFormSyncKey((key) => key + 1);
      onCloneApplied?.();
    },
    [onChange, onCloneApplied],
  );

  const handleAdd = useCallback(() => {
    if (!characterListData) return;
    const newEntryId = entries.length > 0 ? Math.max(...entries.map((c) => c.entryId), 0) + 1 : 1;
    const newUniqueId = getNextCharacterUniqueId();
    const newEntry = createEmptyEntry(newEntryId, newUniqueId);

    updateList((prev) => ({
      ...prev,
      entries: [...prev.entries, newEntry],
    }));

    const nextIndex = entries.length;
    if (isControlled) {
      onSelectChange?.(nextIndex);
    } else {
      setInternalSelectedIndex(nextIndex);
    }
  }, [characterListData, entries, getNextCharacterUniqueId, isControlled, onSelectChange, updateList]);

  if (!characterListData) {
    return <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">Select this tab to load character_list.bin</div>;
  }

  return (
    <div className="flex h-full gap-4 min-h-0">
      <div className="w-1/3 border rounded-lg p-3 overflow-hidden flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold text-sm">Characters ({entries.length})</div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCloneGuiOpen(true)}
              disabled={!selectedCharacter || !cloneGuiWritable}
              className="inline-flex items-center gap-2"
            >
              <Copy className="w-4 h-4" />
              Clone GUI
            </Button>
            <Button size="sm" onClick={handleAdd} className="inline-flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add
            </Button>
          </div>
        </div>

        <CharacterList
          characters={entries}
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
            key={formSyncKey}
            character={selectedCharacter}
            characterId={selectedCharacter.entryId}
            uniqueIdEntries={uniqueIdEntries}
            seriesIdPickerItems={seriesIdPickerItems}
            seriesIdPickerLoading={seriesIdPickerLoading}
            seriesIdPickerError={seriesIdPickerError}
            cardIconIndexPickerItems={cardIconIndexPickerItems}
            cardIconIndexPickerLoading={cardIconIndexPickerLoading}
            cardIconIndexPickerError={cardIconIndexPickerError}
            bgmCuePickerItems={bgmCuePickerItems}
            bgmCuePickerLoading={bgmCuePickerLoading}
            bgmCuePickerError={bgmCuePickerError}
            guiPackItems={guiPackItems}
            guiPackLoading={guiPackLoading}
            guiPackError={guiPackError}
            onOpenGuiPackFolder={onOpenGuiPackFolder}
            jumpToCharacterIdTable={jumpToCharacterIdTable}
            onChange={handleUpdateCharacter}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Select a character to edit</div>
        )}
      </div>

      {characterListData ? (
        <CloneGuiDialog
          open={cloneGuiOpen}
          targetEntry={selectedCharacter}
          characterList={characterListData}
          writable={cloneGuiWritable}
          onOpenChange={setCloneGuiOpen}
          onApplied={handleCloneGuiApplied}
          onPackMutated={onPackMutated}
          onRevealTreeFolder={onRevealTreeFolder}
          onJumpToNaviList={onJumpToNaviList}
          workspaceDocument={workspaceDocument}
        />
      ) : null}

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
                  Are you sure you want to delete Character ID {deleteCandidateCharacter.entryId} (index {deleteCandidateIndex})?
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
