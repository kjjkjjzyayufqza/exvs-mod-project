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
import type { NaviListData, NaviListEntry } from "@/models/naviListEntry";
import type { GuiPackPickerItem } from "../character-list/guiPackIndex";
import type { SeriesIdPickerItem } from "../character-list/SeriesIdPickerPopover";
import { NaviForm } from "./NaviForm";
import { NaviList } from "./NaviList";
import { createEmptyNaviEntry, nextCostumeIndex, nextNaviEntryId, nextNaviUniqueId } from "./naviListModel";

interface NaviEditorProps {
  naviListData?: NaviListData;
  selectedIndex?: number;
  editable?: boolean;
  seriesIdPickerItems: SeriesIdPickerItem[];
  seriesIdPickerLoading?: boolean;
  seriesIdPickerError?: string | null;
  guiPackItems?: GuiPackPickerItem[];
  guiPackLoading?: boolean;
  guiPackError?: string | null;
  onOpenGuiPackFolder?: (hash: number) => void;
  onExtractGuiPack?: (hash: number, fieldKey: string) => void;
  extractingGuiHash?: number | null;
  onChange: (data: NaviListData) => void;
  onSelectChange?: (index: number) => void;
}

export function NaviEditor({
  naviListData,
  selectedIndex: controlledSelectedIndex,
  editable = true,
  seriesIdPickerItems,
  seriesIdPickerLoading,
  seriesIdPickerError,
  guiPackItems,
  guiPackLoading,
  guiPackError,
  onOpenGuiPackFolder,
  onExtractGuiPack,
  extractingGuiHash,
  onChange,
  onSelectChange,
}: NaviEditorProps) {
  const [internalSelectedIndex, setInternalSelectedIndex] = useState(-1);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteCandidateIndex, setDeleteCandidateIndex] = useState<number | null>(null);

  const isControlled = controlledSelectedIndex !== undefined && onSelectChange !== undefined;
  const selectedIndex = isControlled ? controlledSelectedIndex : internalSelectedIndex;
  const entries = naviListData?.entries ?? [];

  const selectedNavi = useMemo<NaviListEntry | null>(() => {
    if (selectedIndex < 0) return null;
    return entries[selectedIndex] ?? null;
  }, [entries, selectedIndex]);

  const updateList = useCallback(
    (updater: (prev: NaviListData) => NaviListData) => {
      if (!naviListData) return;
      onChange(updater(naviListData));
    },
    [naviListData, onChange],
  );

  const handleSelect = useCallback(
    (index: number) => {
      if (isControlled) onSelectChange?.(index);
      else setInternalSelectedIndex(index);
    },
    [isControlled, onSelectChange],
  );

  const handleUpdate = useCallback(
    (updated: NaviListEntry) => {
      if (selectedIndex < 0) return;
      updateList((prev) => {
        const nextRows = [...prev.entries];
        if (!nextRows[selectedIndex]) return prev;
        nextRows[selectedIndex] = updated;
        return { ...prev, entries: nextRows, header: { ...prev.header, entryCount: nextRows.length } };
      });
    },
    [selectedIndex, updateList],
  );

  const confirmDelete = useCallback(() => {
    if (!editable || deleteCandidateIndex === null) return;
    updateList((prev) => {
      const nextRows = prev.entries.filter((_, index) => index !== deleteCandidateIndex);
      return { ...prev, entries: nextRows, header: { ...prev.header, entryCount: nextRows.length } };
    });
    const nextSelected =
      selectedIndex === deleteCandidateIndex
        ? -1
        : selectedIndex > deleteCandidateIndex
          ? selectedIndex - 1
          : selectedIndex;
    handleSelect(nextSelected);
    setDeleteDialogOpen(false);
    setDeleteCandidateIndex(null);
  }, [deleteCandidateIndex, editable, handleSelect, selectedIndex, updateList]);

  const handleCopy = useCallback(
    (index: number) => {
      if (!editable || !naviListData) return;
      const source = naviListData.entries[index];
      if (!source) return;
      const cloned: NaviListEntry = {
        ...source,
        entryId: nextNaviEntryId(naviListData.entries),
        costumeIndex: nextCostumeIndex(naviListData.entries, source.characterUniqueId),
        displayName: source.displayName ? `${source.displayName} Copy` : "Copy",
      };
      updateList((prev) => {
        const nextRows = [...prev.entries, cloned];
        return { ...prev, entries: nextRows, header: { ...prev.header, entryCount: nextRows.length } };
      });
      handleSelect(naviListData.entries.length);
    },
    [editable, handleSelect, naviListData, updateList],
  );

  const handleAdd = useCallback(() => {
    if (!editable || !naviListData) return;
    const created = createEmptyNaviEntry(
      nextNaviEntryId(naviListData.entries),
      nextNaviUniqueId(naviListData.entries),
    );
    updateList((prev) => {
      const nextRows = [...prev.entries, created];
      return { ...prev, entries: nextRows, header: { ...prev.header, entryCount: nextRows.length } };
    });
    handleSelect(naviListData.entries.length);
  }, [editable, handleSelect, naviListData, updateList]);

  if (!naviListData) {
    return (
      <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
        Select this tab to load navi_list.bin
      </div>
    );
  }

  return (
    <div className="flex h-full gap-4 min-h-0">
      <div className="w-1/3 border rounded-lg p-3 overflow-hidden flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold text-sm">Navi ({entries.length})</div>
          <Button size="sm" onClick={handleAdd} disabled={!editable} className="inline-flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add
          </Button>
        </div>
        <NaviList
          naviData={entries}
          editable={editable}
          selectedIndex={selectedIndex}
          onSelect={handleSelect}
          onDelete={(index) => {
            setDeleteCandidateIndex(index);
            setDeleteDialogOpen(true);
          }}
          onCopy={handleCopy}
        />
      </div>
      <div className="flex-1 border rounded-lg p-4 overflow-hidden flex flex-col min-h-0">
        {selectedNavi ? (
          <NaviForm
            navi={selectedNavi}
            naviIndex={selectedIndex}
            entries={entries}
            seriesIdPickerItems={seriesIdPickerItems}
            seriesIdPickerLoading={seriesIdPickerLoading}
            seriesIdPickerError={seriesIdPickerError}
            guiPackItems={guiPackItems}
            guiPackLoading={guiPackLoading}
            guiPackError={guiPackError}
            onOpenGuiPackFolder={onOpenGuiPackFolder}
            onExtractGuiPack={onExtractGuiPack}
            extractingGuiHash={extractingGuiHash}
            onChange={handleUpdate}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Select a navi row to edit
          </div>
        )}
      </div>
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete navi row?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the selected navi_list row from the staged table. Save File writes the change.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
