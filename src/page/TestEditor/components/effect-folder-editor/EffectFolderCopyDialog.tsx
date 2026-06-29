import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { FilePathInput } from "@/components/ui/filePathInput";
import { inferEffectFolderStructurePath } from "@/services/effectFolder/effectFolderService";

type EffectFolderCopyDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectionCount: number;
  busy?: boolean;
  onCopy: (destination: { effectRoot: string; structureJsonPath: string }) => Promise<void>;
};

export function EffectFolderCopyDialog({
  open: dialogOpen,
  onOpenChange,
  selectionCount,
  busy = false,
  onCopy,
}: EffectFolderCopyDialogProps) {
  const [destinationRoot, setDestinationRoot] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dialogOpen) return;
    setDestinationRoot("");
    setError(null);
  }, [dialogOpen]);

  const pickDestinationFolder = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") {
      setDestinationRoot(selected);
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = destinationRoot.trim();
    if (!trimmed) {
      setError("Pick a destination effect pack folder.");
      return;
    }
    setError(null);
    try {
      const structureJsonPath = inferEffectFolderStructurePath(trimmed);
      await onCopy({ effectRoot: trimmed, structureJsonPath });
      onOpenChange(false);
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : String(copyError));
    }
  }, [destinationRoot, onCopy, onOpenChange]);

  return (
    <Dialog open={dialogOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Copy to another effect pack</DialogTitle>
          <DialogDescription>
            Copy {selectionCount} selected entr{selectionCount === 1 ? "y" : "ies"} including related textures and
            models when required.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor="effect-copy-destination">Destination effect pack folder</Label>
          <div className="flex gap-2">
            <FilePathInput
              id="effect-copy-destination"
              value={destinationRoot}
              onChange={(event) => setDestinationRoot(event.target.value)}
              placeholder="E:\\workspace\\006effect\\0xHASH"
            />
            <Button type="button" variant="outline" onClick={() => void pickDestinationFolder()}>
              Browse
            </Button>
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={busy || selectionCount === 0}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
