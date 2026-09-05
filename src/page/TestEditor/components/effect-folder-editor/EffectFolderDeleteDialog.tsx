import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("test-effect-folder");
  const [deleteFiles, setDeleteFiles] = useState(false);

  useEffect(() => {
    if (!dialogOpen) return;
    setDeleteFiles(false);
  }, [dialogOpen]);

  return (
    <AlertDialog open={dialogOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deleteDialog.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("deleteDialog.description", { count: selectionCount, file: "_structure.json" })}
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
            {t("deleteDialog.alsoDelete")}
          </Label>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t("actions.cancel")}</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={busy || selectionCount === 0}
            onClick={() => void onConfirm(deleteFiles)}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t("actions.remove")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
