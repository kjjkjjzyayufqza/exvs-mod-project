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
import type { StageDataEntry, StageList } from "@/models/stageList";
import { StageForm } from "./StageForm";
import { StageList as StageListComponent, type StageListSortKey } from "./StageList";
import type { StageIconIndexPickerGroup } from "./StageIconIndexPickerPopover";

function createEmptyStage(id: number): StageDataEntry {
  return {
    id,
    unk1: 0, unk2: 0, unk3: 0, unk4: 0, unk5: 0, unk6: 0, vs_s_d: 0, fileName: 0, unk9: 0,
    vs_s_l: 0, unk11: 0,
    name: { Offset: 0, StringBufferData: Buffer.from([0]), Utf8String: "" },
    unk13: 0, unk14: 0, unk15: 0, uniqueIndex: 0, vs_sn: 0, iconIndex: 0,
  };
}

interface StageEditorProps {
  stageListData?: StageList | null;
  selectedIndex: number;
  onSelectChange: (index: number) => void;
  sortKey?: StageListSortKey;
  onSortKeyChange?: (key: StageListSortKey) => void;
  searchInputValue?: string;
  searchTerm?: string;
  onSearchInputChange?: (value: string) => void;
  onSearchTermChange?: (value: string) => void;
  isComposing?: boolean;
  onComposingChange?: (value: boolean) => void;
  obDplCachePath?: string;
  obModPath?: string;
  workspacePath?: string;
  onReveal?: (path: string) => void;
  onChange: (data: StageList) => void;
  stageIconConvertDirPath?: string;
  stageIconBaseNameOrder?: Array<string | null>;
  stageIconIndexPickerGroups?: StageIconIndexPickerGroup[];
  stageIconIndexPickerLoading?: boolean;
  stageIconIndexPickerError?: string | null;
}

export function StageEditor({
  stageListData,
  selectedIndex,
  onSelectChange,
  sortKey = "unk1",
  onSortKeyChange,
  searchInputValue = "",
  searchTerm = "",
  onSearchInputChange,
  onSearchTermChange,
  isComposing = false,
  onComposingChange,
  obDplCachePath = "",
  obModPath = "",
  workspacePath = "",
  onReveal,
  onChange,
  stageIconConvertDirPath,
  stageIconBaseNameOrder,
  stageIconIndexPickerGroups = [],
  stageIconIndexPickerLoading = false,
  stageIconIndexPickerError = null,
}: StageEditorProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteCandidateIndex, setDeleteCandidateIndex] = useState<number | null>(null);

  const selectedStage = useMemo<StageDataEntry | null>(() => {
    if (!stageListData) return null;
    if (selectedIndex < 0) return null;
    return stageListData.StageData[selectedIndex] ?? null;
  }, [stageListData, selectedIndex]);

  const deleteCandidateStage = useMemo<StageDataEntry | null>(() => {
    if (!stageListData) return null;
    if (deleteCandidateIndex === null) return null;
    return stageListData.StageData[deleteCandidateIndex] ?? null;
  }, [stageListData, deleteCandidateIndex]);

  const updateList = useCallback(
    (updater: (prev: StageList) => StageList) => {
      if (!stageListData) return;
      const next = updater(stageListData);
      onChange(next);
    },
    [stageListData, onChange]
  );

  const handleSelect = useCallback((index: number) => {
    onSelectChange(index);
  }, [onSelectChange]);

  const handleUpdateStage = useCallback(
    (updatedStage: StageDataEntry) => {
      if (!stageListData) return;
      if (selectedIndex < 0) return;

      updateList((prevList) => {
        const nextRows = [...prevList.StageData];
        if (!nextRows[selectedIndex]) return prevList;
        nextRows[selectedIndex] = updatedStage;
        return Object.assign(Object.create(Object.getPrototypeOf(prevList)), prevList, {
          StageData: nextRows,
          StageCount: nextRows.length,
        });
      });
    },
    [stageListData, selectedIndex, updateList]
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
    if (!stageListData) return;
    if (deleteCandidateIndex === null) return;

    updateList((prevList) => {
      const nextRows = prevList.StageData.filter((_, i) => i !== deleteCandidateIndex);
      return Object.assign(Object.create(Object.getPrototypeOf(prevList)), prevList, {
        StageData: nextRows,
        StageCount: nextRows.length,
      });
    });

    const nextIndex =
      selectedIndex === deleteCandidateIndex
        ? -1
        : selectedIndex > deleteCandidateIndex
          ? selectedIndex - 1
          : selectedIndex;
    onSelectChange(nextIndex);

    closeDeleteDialog();
  }, [stageListData, closeDeleteDialog, deleteCandidateIndex, selectedIndex, onSelectChange, updateList]);

  const getNextId = useCallback(() => {
    if (!stageListData || stageListData.StageData.length === 0) return 0;
    const maxId = Math.max(...stageListData.StageData.map((s) => s.id ?? 0), 0);
    return maxId + 1;
  }, [stageListData]);

  /**
   * Next uniqueIndex = max(existing) + 1.
   * Does not reuse gaps; always uses the next value after the current maximum.
   */
  const getNextUniqueIndex = useCallback(() => {
    if (!stageListData || stageListData.StageData.length === 0) return 1;
    const maxVal = Math.max(
      0,
      ...stageListData.StageData.map((s) => (typeof s.uniqueIndex === "number" ? s.uniqueIndex : 0))
    );
    return maxVal + 1;
  }, [stageListData]);

  const handleAdd = useCallback(() => {
    if (!stageListData) return;

    const newId = getNextId();
    updateList((prevList) => {
      const nextRows = [...prevList.StageData, createEmptyStage(newId)];
      return Object.assign(Object.create(Object.getPrototypeOf(prevList)), prevList, {
        StageData: nextRows,
        StageCount: nextRows.length,
      });
    });

    onSelectChange(stageListData.StageData.length);
  }, [stageListData, getNextId, onSelectChange, updateList]);

  const handleCopyAsNew = useCallback(
    (index: number) => {
      if (!stageListData) return;
      const sourceStage = stageListData.StageData[index];
      if (!sourceStage) return;

      const newId = getNextId();
      const newUniqueIndex = getNextUniqueIndex();
      const copiedStage: StageDataEntry = {
        ...sourceStage,
        id: newId,
        uniqueIndex: newUniqueIndex,
        name: sourceStage.name
          ? {
              ...sourceStage.name,
              StringBufferData: Buffer.from(sourceStage.name.StringBufferData),
            }
          : { Offset: 0, StringBufferData: Buffer.from([0]), Utf8String: "" },
      };

      updateList((prevList) => {
        const nextRows = [...prevList.StageData, copiedStage];
        return Object.assign(Object.create(Object.getPrototypeOf(prevList)), prevList, {
          StageData: nextRows,
          StageCount: nextRows.length,
        });
      });

      onSelectChange(stageListData.StageData.length);
    },
    [stageListData, getNextId, getNextUniqueIndex, onSelectChange, updateList]
  );

  if (!stageListData) {
    return (
      <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
        Select this tab to load stage_list.bin
      </div>
    );
  }

  return (
    <div className="flex h-full gap-4 min-h-0">
      <div className="w-1/3 border rounded-lg p-3 overflow-hidden flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold text-sm">Stages ({stageListData.StageData.length})</div>
          <Button size="sm" onClick={handleAdd} className="inline-flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add
          </Button>
        </div>

        <StageListComponent
          stageData={stageListData.StageData}
          selectedIndex={selectedIndex}
          onSelect={handleSelect}
          onCopy={handleCopyAsNew}
          onDelete={openDeleteDialog}
          sortKey={sortKey}
          onSortKeyChange={onSortKeyChange}
          searchInputValue={searchInputValue}
          searchTerm={searchTerm}
          onSearchInputChange={onSearchInputChange}
          onSearchTermChange={onSearchTermChange}
          isComposing={isComposing}
          onComposingChange={onComposingChange}
          stageIconConvertDirPath={stageIconConvertDirPath}
          stageIconBaseNameOrder={stageIconBaseNameOrder}
        />
      </div>

      <div className="flex-1 border rounded-lg p-4 overflow-auto flex flex-col min-h-0">
        {selectedStage ? (
          <StageForm
            stage={selectedStage}
            index={selectedIndex}
            onChange={handleUpdateStage}
            obDplCachePath={obDplCachePath}
            obModPath={obModPath}
            workspacePath={workspacePath}
            onReveal={onReveal}
            stageIconIndexPickerGroups={stageIconIndexPickerGroups}
            stageIconIndexPickerLoading={stageIconIndexPickerLoading}
            stageIconIndexPickerError={stageIconIndexPickerError}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Select a stage to edit
          </div>
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
            <AlertDialogTitle>Delete Stage</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteCandidateStage ? (
                <>Are you sure you want to delete stage #{deleteCandidateIndex}? This action cannot be undone.</>
              ) : (
                <>Are you sure you want to delete this stage? This action cannot be undone.</>
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
