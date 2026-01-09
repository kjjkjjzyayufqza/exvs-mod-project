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
import type { SeriesData, SeriesList } from "@/models/seriesList";
import { SeriesForm } from "./SeriesForm";
import { SeriesList as SeriesListComponent } from "./SeriesList";

interface SeriesEditorProps {
  seriesListData?: SeriesList;
  seriesImageConvertDirPath?: string;
  seriesImageSeriesBaseNameOrder?: Array<string | null>;
  onRefreshSeriesImages?: () => Promise<void> | void;
  onChange: (data: SeriesList) => void;
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
      return seriesListData.SeriesData.some((s, i) => i !== selectedIndex && s.SeriesId === nextId);
    },
    [seriesListData, selectedIndex]
  );

  const selectedSeries = useMemo<SeriesData | null>(() => {
    if (!seriesListData) return null;
    if (selectedIndex < 0) return null;
    return seriesListData.SeriesData[selectedIndex] ?? null;
  }, [seriesListData, selectedIndex]);

  const deleteCandidateSeries = useMemo<SeriesData | null>(() => {
    if (!seriesListData) return null;
    if (deleteCandidateIndex === null) return null;
    return seriesListData.SeriesData[deleteCandidateIndex] ?? null;
  }, [seriesListData, deleteCandidateIndex]);

  const updateList = useCallback(
    (updater: (prev: SeriesList) => SeriesList) => {
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
    (updatedSeries: SeriesData) => {
      if (!seriesListData) return;
      if (selectedIndex < 0) return;

      updateList((prevList) => {
        const nextRows = [...prevList.SeriesData];
        if (!nextRows[selectedIndex]) return prevList;
        nextRows[selectedIndex] = updatedSeries;
        return Object.assign(Object.create(Object.getPrototypeOf(prevList)), prevList, {
          SeriesData: nextRows,
          SeriesCount: nextRows.length,
        });
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
      const nextRows = prevList.SeriesData.filter((_, i) => i !== deleteCandidateIndex);
      return Object.assign(Object.create(Object.getPrototypeOf(prevList)), prevList, {
        SeriesData: nextRows,
        SeriesCount: nextRows.length,
      });
    });

    setSelectedIndex((prev) => {
      if (prev === deleteCandidateIndex) return -1;
      if (prev > deleteCandidateIndex) return prev - 1;
      return prev;
    });

    closeDeleteDialog();
  }, [seriesListData, closeDeleteDialog, deleteCandidateIndex, updateList]);

  const handleCopy = useCallback(
    (index: number) => {
      if (!seriesListData) return;
      const seriesToCopy = seriesListData.SeriesData[index];
      if (!seriesToCopy) return;

      const existingIds = new Set(seriesListData.SeriesData.map((s) => s.SeriesId));
      let newSeriesId = seriesToCopy.SeriesId;
      while (existingIds.has(newSeriesId)) newSeriesId++;

      const clonedSeries: SeriesData = {
        SeriesId: newSeriesId,
        iconFileIndex: seriesToCopy.iconFileIndex,
        unk2: seriesToCopy.unk2,
        unk3: seriesToCopy.unk3,
        unk4: seriesToCopy.unk4,
        unk5: seriesToCopy.unk5,
        characterListPosition: seriesToCopy.characterListPosition,
        unkStr1: {
          Offset: 0,
          StringBufferData: seriesToCopy.unkStr1?.StringBufferData
            ? Buffer.from(seriesToCopy.unkStr1.StringBufferData)
            : Buffer.from([0]),
          Utf8String: seriesToCopy.unkStr1?.Utf8String
            ? `${seriesToCopy.unkStr1.Utf8String} Copy`
            : "Copy",
        },
      };

      updateList((prevList) => {
        const nextRows = [...prevList.SeriesData, clonedSeries];
        return Object.assign(Object.create(Object.getPrototypeOf(prevList)), prevList, {
          SeriesData: nextRows,
          SeriesCount: nextRows.length,
        });
      });

      setSelectedIndex(seriesListData.SeriesData.length);
    },
    [seriesListData, updateList]
  );

  const handleAdd = useCallback(() => {
    if (!seriesListData) return;

    const rows = seriesListData.SeriesData;
    const existingIds = new Set(rows.map((s) => (s.SeriesId | 0)));
    const selectedSeriesId = selectedIndex >= 0 ? (rows[selectedIndex]?.SeriesId ?? 0) : 0;
    const preferNegative = selectedSeriesId < 0;

    const getNextSeriesId = (): number => {
      const positiveIds = rows.map((s) => (s.SeriesId | 0)).filter((id) => id > 0);
      const negativeIds = rows.map((s) => (s.SeriesId | 0)).filter((id) => id < 0);

      const maxPositive = positiveIds.length > 0 ? Math.max(...positiveIds) : 0;
      const minNegative = negativeIds.length > 0 ? Math.min(...negativeIds) : 0;

      let candidate = preferNegative
        ? (negativeIds.length > 0 ? (minNegative - 1) : -1)
        : (positiveIds.length > 0 ? (maxPositive + 1) : 1);

      while (existingIds.has(candidate)) {
        candidate = preferNegative ? (candidate - 1) : (candidate + 1);
      }
      return candidate | 0;
    };

    const maxPlusOne = (getter: (row: SeriesData) => number): number => {
      let max = 0;
      for (const row of rows) {
        const v = getter(row);
        if (Number.isFinite(v) && v > max) max = v;
      }
      return (max | 0) + 1;
    };

    const newSeriesId = getNextSeriesId();
    const newSeries: SeriesData = {
      SeriesId: newSeriesId,
      iconFileIndex: 0,
      unk2: maxPlusOne((s) => s.unk2),
      unk3: maxPlusOne((s) => s.unk3),
      unk4: maxPlusOne((s) => s.unk4),
      unk5: maxPlusOne((s) => s.unk5),
      characterListPosition: maxPlusOne((s) => s.characterListPosition),
      unkStr1: {
        Offset: 0,
        StringBufferData: Buffer.from([0]),
        Utf8String: `New Series ${seriesListData.SeriesData.length + 1}`,
      },
    };

    updateList((prevList) => {
      const nextRows = [...prevList.SeriesData, newSeries];
      return Object.assign(Object.create(Object.getPrototypeOf(prevList)), prevList, {
        SeriesData: nextRows,
        SeriesCount: nextRows.length,
      });
    });

    setSelectedIndex(seriesListData.SeriesData.length);
  }, [seriesListData, selectedIndex, updateList]);

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
          <div className="font-semibold text-sm">Series ({seriesListData.SeriesData.length})</div>
          <Button size="sm" onClick={handleAdd} className="inline-flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add
          </Button>
        </div>

        <SeriesListComponent
          seriesData={seriesListData.SeriesData}
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
                  Are you sure you want to delete "{deleteCandidateSeries.unkStr1?.Utf8String || ""}" (index {deleteCandidateIndex})?
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

