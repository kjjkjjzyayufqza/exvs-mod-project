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
import type { SeriesListData, SeriesListEntry } from "@/models/seriesListEntry";
import { SeriesForm } from "./SeriesForm";
import { SeriesList as SeriesListComponent } from "./SeriesList";

interface SeriesEditorProps {
  seriesListData?: SeriesListData;
  seriesImageConvertDirPath?: string;
  seriesImageSeriesBaseNameOrder?: Array<string | null>;
  onRefreshSeriesImages?: () => Promise<void> | void;
  onChange: (data: SeriesListData) => void;
}

function createEmptySeriesEntry(entryId: number, name: string): SeriesListEntry {
  return {
    entryId,
    recordLookupId: 0,
    iconFileIndex: 0,
    unk0x08: 0,
    name,
    displayNameRef: 0,
    characterListPosition: 0,
  };
}

export function SeriesEditor({
  seriesListData,
  seriesImageConvertDirPath,
  seriesImageSeriesBaseNameOrder,
  onRefreshSeriesImages,
  onChange,
}: SeriesEditorProps) {
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteCandidateIndex, setDeleteCandidateIndex] = useState<number | null>(null);

  const isSeriesIdTaken = useCallback(
    (nextId: number) => {
      if (!seriesListData) return false;
      return seriesListData.entries.some((s, i) => i !== selectedIndex && s.entryId === nextId);
    },
    [seriesListData, selectedIndex]
  );

  const selectedSeries = useMemo<SeriesListEntry | null>(() => {
    if (!seriesListData) return null;
    if (selectedIndex < 0) return null;
    return seriesListData.entries[selectedIndex] ?? null;
  }, [seriesListData, selectedIndex]);

  const deleteCandidateSeries = useMemo<SeriesListEntry | null>(() => {
    if (!seriesListData) return null;
    if (deleteCandidateIndex === null) return null;
    return seriesListData.entries[deleteCandidateIndex] ?? null;
  }, [seriesListData, deleteCandidateIndex]);

  const updateList = useCallback(
    (updater: (prev: SeriesListData) => SeriesListData) => {
      if (!seriesListData) return;
      const next = updater(seriesListData);
      onChange(next);
    },
    [seriesListData, onChange]
  );

  const handleSelect = useCallback((index: number) => {
    setSelectedIndex(index);
  }, []);

  const handleUpdateSeries = useCallback(
    (updatedSeries: SeriesListEntry) => {
      if (!seriesListData) return;
      if (selectedIndex < 0) return;

      updateList((prevList) => {
        const nextRows = [...prevList.entries];
        if (!nextRows[selectedIndex]) return prevList;
        nextRows[selectedIndex] = updatedSeries;
        return { ...prevList, entries: nextRows, header: { ...prevList.header, entryCount: nextRows.length } };
      });
    },
    [seriesListData, selectedIndex, updateList]
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
    if (!seriesListData) return;
    if (deleteCandidateIndex === null) return;

    updateList((prevList) => {
      const nextRows = prevList.entries.filter((_, i) => i !== deleteCandidateIndex);
      return { ...prevList, entries: nextRows, header: { ...prevList.header, entryCount: nextRows.length } };
    });

    setSelectedIndex((prev) => {
      if (prev === deleteCandidateIndex) return -1;
      if (prev > deleteCandidateIndex) return prev - 1;
      return prev;
    });

    closeDeleteDialog();
  }, [seriesListData, closeDeleteDialog, deleteCandidateIndex, updateList]);

  const getNextSeriesId = useCallback(
    (options: { preferNegative?: boolean; startFrom?: number }): number => {
      if (!seriesListData) return options.startFrom ?? 1;
      const rows = seriesListData.entries;
      const existingIds = new Set(rows.map((s) => (s.entryId | 0)));

      if (options.startFrom !== undefined) {
        let candidate = options.startFrom;
        while (existingIds.has(candidate)) {
          candidate += 1;
        }
        return candidate;
      }

      const preferNegative = options.preferNegative ?? false;
      const positiveIds = rows.map((s) => (s.entryId | 0)).filter((id) => id > 0);
      const negativeIds = rows.map((s) => (s.entryId | 0)).filter((id) => id < 0);
      const maxPositive = positiveIds.length > 0 ? Math.max(...positiveIds) : 0;
      const minNegative = negativeIds.length > 0 ? Math.min(...negativeIds) : 0;

      let candidate = preferNegative
        ? (negativeIds.length > 0 ? (minNegative - 1) : -1)
        : (positiveIds.length > 0 ? (maxPositive + 1) : 1);

      while (existingIds.has(candidate)) {
        candidate = preferNegative ? (candidate - 1) : (candidate + 1);
      }
      return candidate | 0;
    },
    [seriesListData]
  );

  const handleCopy = useCallback(
    (index: number) => {
      if (!seriesListData) return;
      const seriesToCopy = seriesListData.entries[index];
      if (!seriesToCopy) return;

      const newSeriesId = getNextSeriesId({ startFrom: seriesToCopy.entryId + 1 });

      const clonedSeries: SeriesListEntry = {
        ...seriesToCopy,
        entryId: newSeriesId,
        name: seriesToCopy.name ? `${seriesToCopy.name} Copy` : "Copy",
      };

      updateList((prevList) => {
        const nextRows = [...prevList.entries, clonedSeries];
        return { ...prevList, entries: nextRows, header: { ...prevList.header, entryCount: nextRows.length } };
      });

      setSelectedIndex(seriesListData.entries.length);
    },
    [seriesListData, getNextSeriesId, updateList]
  );

  const handleAdd = useCallback(() => {
    if (!seriesListData) return;

    const selectedSeriesId =
      selectedIndex >= 0 ? (seriesListData.entries[selectedIndex]?.entryId ?? 0) : 0;
    const preferNegative = selectedSeriesId < 0;
    const newSeriesId = getNextSeriesId({ preferNegative });

    const newSeries = createEmptySeriesEntry(
      newSeriesId,
      `New Series ${seriesListData.entries.length + 1}`
    );

    updateList((prevList) => {
      const nextRows = [...prevList.entries, newSeries];
      return { ...prevList, entries: nextRows, header: { ...prevList.header, entryCount: nextRows.length } };
    });

    setSelectedIndex(seriesListData.entries.length);
  }, [seriesListData, selectedIndex, getNextSeriesId, updateList]);

  if (!seriesListData) {
    return (
      <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
        Select this tab to load series_list.bin
      </div>
    );
  }

  return (
    <div className="flex h-full gap-4 min-h-0">
      <div className="w-1/3 border rounded-lg p-3 overflow-hidden flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold text-sm">Series ({seriesListData.entries.length})</div>
          <Button size="sm" onClick={handleAdd} className="inline-flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add
          </Button>
        </div>

        <SeriesListComponent
          seriesData={seriesListData.entries}
          seriesImageConvertDirPath={seriesImageConvertDirPath}
          seriesImageSeriesBaseNameOrder={seriesImageSeriesBaseNameOrder}
          selectedIndex={selectedIndex}
          onSelect={handleSelect}
          onDelete={openDeleteDialog}
          onCopy={handleCopy}
        />
      </div>

      <div className="flex-1 border rounded-lg p-4 overflow-hidden flex flex-col min-h-0">
        {selectedSeries ? (
          <SeriesForm
            series={selectedSeries}
            index={selectedIndex}
            seriesImageConvertDirPath={seriesImageConvertDirPath}
            seriesImageSeriesBaseNameOrder={seriesImageSeriesBaseNameOrder}
            onRefreshSeriesImages={onRefreshSeriesImages}
            isSeriesIdTaken={isSeriesIdTaken}
            onChange={handleUpdateSeries}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Select a series to edit
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
            <AlertDialogTitle>Delete Series</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteCandidateSeries ? (
                <>
                  Are you sure you want to delete "{deleteCandidateSeries.name || ""}" (index {deleteCandidateIndex})?
                </>
              ) : (
                <>Are you sure you want to delete this series? This action cannot be undone.</>
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

