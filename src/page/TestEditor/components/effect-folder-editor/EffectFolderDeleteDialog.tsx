import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";

type EffectFolderDeleteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectionCount: number;
  busy?: boolean;
  onConfirm: (deleteFiles: boolean) => Promise<void>;
};

export function EffectFolderDeleteDialog({
  open: dialogOpen,
  onOpenChange,
  selectionCount,
  busy = false,
  onConfirm,
}: EffectFolderDeleteDialogProps) {
  const [deleteFiles, setDeleteFiles] = useState(false);

  useEffect(() => {
    if (!dialogOpen) return;
    setDeleteFiles(false);
  }, [dialogOpen]);

  return (
    <AlertDialog open={dialogOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove effect entries</AlertDialogTitle>
          <AlertDialogDescription>
            Remove {selectionCount} selected entr{selectionCount === 1 ? "y" : "ies"} from{" "}
            <code className="rounded bg-muted px-1 py-0.5">_structure.json</code>. This updates the structure file
            immediately.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex items-center gap-2 py-2">
          <Checkbox
            id="effect-delete-files"
            checked={deleteFiles}
            onCheckedChange={(checked) => setDeleteFiles(checked === true)}
            disabled={busy}
          />
          <Label htmlFor="effect-delete-files" className="text-sm font-normal">
            Also delete underlying files from the effect pack folder
          </Label>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={busy || selectionCount === 0}
            onClick={() => void onConfirm(deleteFiles)}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Remove
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
