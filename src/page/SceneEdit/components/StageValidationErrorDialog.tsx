import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Box, Crosshair } from "lucide-react";
import type { ExvsStageValidationError } from "../utils/sceneSessionService";
import { groupErrorsByFolder } from "../utils/sceneValidationErrors";

interface StageValidationErrorDialogProps {
  open: boolean;
  title?: string;
  errors: ExvsStageValidationError[];
  knownFolderNames: readonly string[];
  onClose: () => void;
  onSelectFolder?: (folderName: string) => void;
}

export function StageValidationErrorDialog({
  open,
  title = "Texture validation failed",
  errors,
  knownFolderNames,
  onClose,
  onSelectFolder,
}: StageValidationErrorDialogProps) {
  const groups = groupErrorsByFolder(errors, knownFolderNames);
  const objectCount = groups.filter((g) => g.folder !== null).length;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {errors.length} issue{errors.length !== 1 ? "s" : ""}
            {objectCount > 0 ? ` across ${objectCount} object${objectCount !== 1 ? "s" : ""}` : ""}{" "}
            blocked packing. Fix the texture paths and try again.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-72 rounded border p-3">
          <div className="space-y-4 pr-2">
            {groups.map((group) => (
              <div key={group.folder ?? "__stage__"} className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Box className="h-4 w-4 shrink-0 text-destructive" />
                  <span className="truncate">{group.folder ?? "Stage"}</span>
                  {group.folder && onSelectFolder && (
                    <button
                      type="button"
                      className="ml-auto flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                      onClick={() => onSelectFolder(group.folder!)}
                      title="Select this object in the outliner"
                    >
                      <Crosshair className="h-3 w-3" />
                      Locate
                    </button>
                  )}
                </div>
                <ul className="ml-6 space-y-1 text-xs text-muted-foreground list-disc">
                  {group.errors.map((error, idx) => (
                    <li key={`${group.folder ?? "stage"}:${idx}`} className="break-all">
                      {error.message}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
