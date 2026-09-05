import { useCallback, useMemo, useState } from "react";
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
import type { StageListData, StageListEntry } from "@/models/stageListEntry";
import { StageForm } from "./StageForm";
import { StageList as StageListComponent, type StageListSortKey } from "./StageList";
import type { StageIconIndexPickerGroup } from "./StageIconIndexPickerPopover";
import type { UseResourceRegistryResult } from "@/hooks/useResourceRegistry";
import type { TestEditorWorkspaceDocument } from "@/services/testEditorWorkspace/types";
import { useTranslation } from "react-i18next";

function createEmptyStage(id: number): StageListEntry {
  return {
    entryId: id,
    recordLookupId: 0,
    randomSelectWeightDefault: 0,
    randomSelectWeightAlt: 0,
    unk0x0c: 0,
    seriesAltGroupId: 0,
    unk0x14: 0,
    vsSD: 0,
    fileName: 0,
    selectOrderAlt: 0,
    vsSL: 0,
    seriesDefaultGroupId: 0,
    name: "",
    unk0x34: 0,
    unk0x38: 0,
    selectOrderDefault: 0,
    vsSn: 0,
    iconIndex: 0,
  };
}

interface StageEditorProps {
  stageListData?: StageListData | null;
  editable?: boolean;
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
  workspaceRootPath?: string;
  stageModelRouteRootPath?: string;
  workspaceDocument?: TestEditorWorkspaceDocument;
  onReveal?: (path: string) => void;
  onChange: (data: StageListData) => void;
  stageIconConvertDirPath?: string;
  stageIconBaseNameOrder?: Array<string | null>;
  stageIconIndexPickerGroups?: StageIconIndexPickerGroup[];
  stageIconIndexPickerLoading?: boolean;
  stageIconIndexPickerError?: string | null;
  resourceRegistry?: UseResourceRegistryResult;
}

export function StageEditor({
  stageListData,
  editable = true,
  selectedIndex,
  onSelectChange,
  sortKey = "selectOrderDefault",
  onSortKeyChange,
  searchInputValue = "",
  searchTerm = "",
  onSearchInputChange,
  onSearchTermChange,
  isComposing = false,
  onComposingChange,
  obDplCachePath = "",
  obModPath = "",
  workspaceRootPath = "",
  stageModelRouteRootPath = "",
  workspaceDocument,
  onReveal,
  onChange,
  stageIconConvertDirPath,
  stageIconBaseNameOrder,
  stageIconIndexPickerGroups = [],
  stageIconIndexPickerLoading = false,
  stageIconIndexPickerError = null,
  resourceRegistry,
}: StageEditorProps) {
  const { t } = useTranslation("test-stage-list-view");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteCandidateIndex, setDeleteCandidateIndex] = useState<number | null>(null);

  const selectedStage = useMemo<StageListEntry | null>(() => {
    if (!stageListData) return null;
    if (selectedIndex < 0) return null;
    return stageListData.entries[selectedIndex] ?? null;
  }, [stageListData, selectedIndex]);

  const deleteCandidateStage = useMemo<StageListEntry | null>(() => {
    if (!stageListData) return null;
    if (deleteCandidateIndex === null) return null;
    return stageListData.entries[deleteCandidateIndex] ?? null;
  }, [stageListData, deleteCandidateIndex]);

  const updateList = useCallback(
    (updater: (prev: StageListData) => StageListData) => {
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
    (updatedStage: StageListEntry) => {
      if (!stageListData) return;
      if (selectedIndex < 0) return;

      updateList((prevList) => {
        const nextRows = [...prevList.entries];
        if (!nextRows[selectedIndex]) return prevList;
        nextRows[selectedIndex] = updatedStage;
        return { ...prevList, entries: nextRows, header: { ...prevList.header, entryCount: nextRows.length } };
      });
    },
    [stageListData, selectedIndex, updateList]
  );

  const openDeleteDialog = useCallback((index: number) => {
    if (!editable) return;
    setDeleteCandidateIndex(index);
    setDeleteDialogOpen(true);
  }, [editable]);

  const closeDeleteDialog = useCallback(() => {
    setDeleteDialogOpen(false);
    setDeleteCandidateIndex(null);
  }, []);

  const confirmDelete = useCallback(() => {
    if (!editable) return;
    if (!stageListData) return;
    if (deleteCandidateIndex === null) return;

    updateList((prevList) => {
      const nextRows = prevList.entries.filter((_, i) => i !== deleteCandidateIndex);
      return { ...prevList, entries: nextRows, header: { ...prevList.header, entryCount: nextRows.length } };
    });

    const nextIndex =
      selectedIndex === deleteCandidateIndex
        ? -1
        : selectedIndex > deleteCandidateIndex
          ? selectedIndex - 1
          : selectedIndex;
    onSelectChange(nextIndex);

    closeDeleteDialog();
  }, [editable, stageListData, closeDeleteDialog, deleteCandidateIndex, selectedIndex, onSelectChange, updateList]);

  const getNextId = useCallback(() => {
    if (!stageListData || stageListData.entries.length === 0) return 0;
    const maxId = Math.max(...stageListData.entries.map((s) => s.entryId ?? 0), 0);
    return maxId + 1;
  }, [stageListData]);

  /**
   * Next selectOrderDefault = max(existing) + 1.
   * Does not reuse gaps; always uses the next value after the current maximum.
   */
  const getNextSelectOrder = useCallback(() => {
    if (!stageListData || stageListData.entries.length === 0) return 1;
    const maxVal = Math.max(
      0,
      ...stageListData.entries.map((s) => (typeof s.selectOrderDefault === "number" ? s.selectOrderDefault : 0))
    );
    return maxVal + 1;
  }, [stageListData]);

  const handleAdd = useCallback(() => {
    if (!editable) return;
    if (!stageListData) return;

    const newId = getNextId();
    updateList((prevList) => {
      const nextRows = [...prevList.entries, createEmptyStage(newId)];
      return { ...prevList, entries: nextRows, header: { ...prevList.header, entryCount: nextRows.length } };
    });

    onSelectChange(stageListData.entries.length);
  }, [editable, stageListData, getNextId, onSelectChange, updateList]);

  const handleCopyAsNew = useCallback(
    (index: number) => {
      if (!editable) return;
      if (!stageListData) return;
      const sourceStage = stageListData.entries[index];
      if (!sourceStage) return;

      const newId = getNextId();
      const newSelectOrder = getNextSelectOrder();
      const copiedStage: StageListEntry = {
        ...sourceStage,
        entryId: newId,
        selectOrderDefault: newSelectOrder,
      };

      updateList((prevList) => {
        const nextRows = [...prevList.entries, copiedStage];
        return { ...prevList, entries: nextRows, header: { ...prevList.header, entryCount: nextRows.length } };
      });

      onSelectChange(stageListData.entries.length);
    },
    [editable, stageListData, getNextId, getNextSelectOrder, onSelectChange, updateList]
  );

  if (!stageListData) {
    return (
      <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
        {t("editor.selectTab")}
      </div>
    );
  }

  return (
    <div className="flex h-full gap-4 min-h-0">
      <div className="w-1/3 border rounded-lg p-3 overflow-hidden flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold text-sm">{t("editor.countLabel", { count: stageListData.entries.length })}</div>
          <Button size="sm" onClick={handleAdd} disabled={!editable} className="inline-flex items-center gap-2">
            <Plus className="w-4 h-4" />
            {t("actions.add")}
          </Button>
        </div>

        <StageListComponent
          stageData={stageListData.entries}
          editable={editable}
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
            editable={editable}
            onChange={handleUpdateStage}
            obDplCachePath={obDplCachePath}
            obModPath={obModPath}
            workspaceRootPath={workspaceRootPath}
            stageModelRouteRootPath={stageModelRouteRootPath}
            workspaceDocument={workspaceDocument}
            onReveal={onReveal}
            stageIconIndexPickerGroups={stageIconIndexPickerGroups}
            stageIconIndexPickerLoading={stageIconIndexPickerLoading}
            stageIconIndexPickerError={stageIconIndexPickerError}
            resourceRegistry={resourceRegistry}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            {t("editor.selectToEdit")}
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
            <AlertDialogTitle>{t("editor.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteCandidateStage
                ? t("editor.deleteNamed", { index: deleteCandidateIndex })
                : t("editor.deleteUntitled")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={closeDeleteDialog}>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={!editable} className="bg-red-600 hover:bg-red-700">
              {t("actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
