import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { join } from "@tauri-apps/api/path";
import { exists } from "@tauri-apps/plugin-fs";
import { PackageCheck } from "lucide-react";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { repackFolderUsingStructureToModFolder } from "@/utils/repackRunner";
import { normalizePackFolderName } from "../utils/packName";
import { removeMatchingModVgsht2 } from "../utils/modVgsht2";

type ListeningRepackDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rootDir: string;
  dirtyFolders: string[];
  modFolderPath?: string;
  onFolderRepacked: (folderName: string) => void;
  onComplete?: () => void;
};

type FolderEntry = {
  name: string;
  structurePath: string;
  exists: boolean;
  selected: boolean;
};

const LABEL_MISSING = "Missing structure file";
const LISTENING_REPACK_DIMENSIONS = {
  width: 640,
  height: 620,
  minWidth: 440,
  minHeight: 360,
};

export default function ListeningRepackDialog({
  open,
  onOpenChange,
  rootDir,
  dirtyFolders,
  modFolderPath,
  onFolderRepacked,
  onComplete,
}: ListeningRepackDialogProps) {
  const [entries, setEntries] = useState<FolderEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [removeVgsht2InMod, setRemoveVgsht2InMod] = useState(true);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!open || !rootDir || dirtyFolders.length === 0) {
        setEntries([]);
        return;
      }
      setIsLoading(true);
      try {
        const seen = new Set<string>();
        const names: string[] = [];
        for (const rawName of dirtyFolders) {
          const name = normalizePackFolderName(rawName);
          if (!name || seen.has(name)) {
            continue;
          }
          seen.add(name);
          names.push(name);
        }
        const next = await Promise.all(
          names.map(async (name): Promise<FolderEntry> => {
            const structurePath = await join(rootDir, `${name}_structure.json`);
            const structureExists = await exists(structurePath);
            return {
              name,
              structurePath,
              exists: structureExists,
              selected: structureExists,
            };
          }),
        );
        if (!cancelled) setEntries(next);
      } catch (error) {
        console.error("Failed to prepare repack list", error);
        if (!cancelled) {
          toast.error("Failed to prepare repack list");
          setEntries([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, rootDir, dirtyFolders]);

  const selectedEntries = useMemo(
    () => entries.filter((entry) => entry.exists && entry.selected),
    [entries]
  );
  const getScrollElement = useCallback(() => listRef.current, []);
  const rowVirtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement,
    estimateSize: () => 68,
    getItemKey: (index) => entries[index]?.name ?? index,
    overscan: 8,
  });

  const toggleSelection = (name: string, checked: boolean) => {
    setEntries((prev) =>
      prev.map((entry) =>
        entry.name === name ? { ...entry, selected: checked } : entry
      )
    );
  };

  const handleConfirm = async () => {
    if (selectedEntries.length === 0) {
      onOpenChange(false);
      onComplete?.();
      return;
    }
    const modDir = modFolderPath?.trim();
    if (!modDir) {
      toast.error("Configure OB Mod path in Config before repacking");
      return;
    }
    setIsRunning(true);
    try {
      for (const entry of selectedEntries) {
        try {
          const inputFolderPath = await join(rootDir, entry.name);
          const repackResult = await repackFolderUsingStructureToModFolder({
            structurePath: entry.structurePath,
            inputFolderPath,
            modFolderPath: modDir,
          });
          if (removeVgsht2InMod) {
            try {
              const removed = await removeMatchingModVgsht2(modDir, entry.name);
              if (removed) {
                toast.success(`Repacked to mod: ${repackResult.outputPath}`, {
                  description: `Removed ${entry.name}.vgsht2`,
                });
              } else {
                toast.success(`Repacked to mod: ${repackResult.outputPath}`);
              }
            } catch (removeErr) {
              console.error(`Failed to remove mod/${entry.name}.vgsht2`, removeErr);
              toast.error(
                `Repacked to mod but failed to remove .vgsht2: ${(removeErr as Error).message}`,
              );
            }
          } else {
            toast.success(`Repacked to mod: ${repackResult.outputPath}`);
          }
          onFolderRepacked(entry.name);
        } catch (error) {
          console.error(`Repack failed for ${entry.name}`, error);
          toast.error(
            `Repack failed for ${entry.name}: ${(error as Error).message}`,
          );
        }
      }
    } finally {
      setIsRunning(false);
      onOpenChange(false);
      onComplete?.();
    }
  };

  const handleClose = useCallback(() => {
    if (!isRunning) {
      onOpenChange(false);
      onComplete?.();
    }
  }, [isRunning, onComplete, onOpenChange]);

  if (!open) return null;

  return (
    <AppRndModalShell
      titleId="listening-repack-title"
      title="Repack Changes"
      subtitle="Repack changed folders into the configured OB Mod folder"
      headerIcon={<PackageCheck className="h-4 w-4" />}
      dimensions={LISTENING_REPACK_DIMENSIONS}
      storageKey="listening-repack-dialog-size"
      closeDisabled={isRunning}
      onClose={handleClose}
      footer={
        <div className="flex justify-end gap-2 px-4 py-3">
          <Button variant="outline" onClick={handleClose} disabled={isRunning}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isRunning || selectedEntries.length === 0 || !modFolderPath?.trim()}>
            {isRunning ? "Repacking..." : "Repack"}
          </Button>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <p className="text-sm text-muted-foreground">
          Folders are packed as <code>0xHASH.fhm2d</code> using each pack&apos;s <code>_structure.json</code>.
        </p>
        {!modFolderPath?.trim() ? (
          <p className="text-sm text-amber-600 dark:text-amber-500">
            OB Mod path is not configured. Set it in Config before repacking.
          </p>
        ) : null}
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={removeVgsht2InMod}
            disabled={isRunning}
            onCheckedChange={(checked) => setRemoveVgsht2InMod(Boolean(checked))}
          />
          <span>
            After repack, remove matching <code>.vgsht2</code> in the same OB Mod folder (e.g. pack{" "}
            <code>0x49235031.fhm2d</code> → remove <code>0x49235031.vgsht2</code>). Requires OB Mod path in
            Config.
          </span>
        </label>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Preparing list...</div>
        ) : entries.length === 0 ? (
          <div className="text-sm text-muted-foreground">No folders to repack.</div>
        ) : (
          <div ref={listRef} className="min-h-0 flex-1 overflow-auto overscroll-contain">
            <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const entry = entries[virtualRow.index];
                if (!entry) return null;
                return (
                  <label
                    key={virtualRow.key}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    className="absolute left-0 top-0 flex w-full cursor-pointer items-center gap-3 rounded-md border p-2 text-sm"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <Checkbox
                      checked={entry.selected}
                      disabled={!entry.exists || isRunning}
                      onCheckedChange={(checked) =>
                        toggleSelection(entry.name, Boolean(checked))
                      }
                    />
                    <div className="flex flex-col">
                      <span className="font-medium">{entry.name}</span>
                      <span className="break-all text-xs text-muted-foreground">
                        {entry.structurePath}
                      </span>
                      {!entry.exists ? (
                        <span className="text-xs text-yellow-600">{LABEL_MISSING}</span>
                      ) : null}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </AppRndModalShell>
  );
}
