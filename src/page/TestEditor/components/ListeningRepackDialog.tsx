import { useEffect, useMemo, useState } from "react";
import { join } from "@tauri-apps/api/path";
import { exists } from "@tauri-apps/plugin-fs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { repackFolderUsingStructure } from "@/utils/repackRunner";

type ListeningRepackDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rootDir: string;
  dirtyFolders: string[];
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

export default function ListeningRepackDialog({
  open,
  onOpenChange,
  rootDir,
  dirtyFolders,
  onFolderRepacked,
  onComplete,
}: ListeningRepackDialogProps) {
  const [entries, setEntries] = useState<FolderEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!open || !rootDir || dirtyFolders.length === 0) {
        setEntries([]);
        return;
      }
      setIsLoading(true);
      try {
        const next: FolderEntry[] = [];
        for (const name of dirtyFolders) {
          const structurePath = await join(rootDir, `${name}_structure.json`);
          const structureExists = await exists(structurePath);
          next.push({
            name,
            structurePath,
            exists: structureExists,
            selected: structureExists,
          });
        }
        setEntries(next);
      } catch (error) {
        console.error("Failed to prepare repack list", error);
        toast.error("Failed to prepare repack list");
        setEntries([]);
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [open, rootDir, dirtyFolders]);

  const selectedEntries = useMemo(
    () => entries.filter((entry) => entry.exists && entry.selected),
    [entries]
  );

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
    setIsRunning(true);
    try {
      for (const entry of selectedEntries) {
        try {
          const inputFolderPath = await join(rootDir, entry.name);
          await repackFolderUsingStructure({
            structurePath: entry.structurePath,
            inputFolderPath,
          });
          toast.success(`Repacked ${entry.name}`);
          onFolderRepacked(entry.name);
        } catch (error) {
          console.error(`Repack failed for ${entry.name}`, error);
          toast.error(
            `Repack failed for ${entry.name}: ${(error as Error).message}`
          );
        }
      }
    } finally {
      setIsRunning(false);
      onOpenChange(false);
      onComplete?.();
    }
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen && !isRunning) {
      onOpenChange(false);
      onComplete?.();
    } else {
      onOpenChange(nextOpen);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Repack Changes</DialogTitle>
          <DialogDescription>
            Folders with detected changes will be repacked using their <code>_structure.json</code>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Preparing list...</div>
          ) : entries.length === 0 ? (
            <div className="text-sm text-muted-foreground">No folders to repack.</div>
          ) : (
            <ScrollArea className="max-h-64 pr-4">
              <div className="space-y-2">
                {entries.map((entry) => (
                  <label
                    key={entry.name}
                    className="flex items-center gap-3 rounded-md border p-2 text-sm"
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
                      <span className="text-xs text-muted-foreground break-all">
                        {entry.structurePath}
                      </span>
                      {!entry.exists && (
                        <span className="text-xs text-yellow-600">{LABEL_MISSING}</span>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isRunning}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isRunning || selectedEntries.length === 0}>
            {isRunning ? "Repacking..." : "Repack"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

