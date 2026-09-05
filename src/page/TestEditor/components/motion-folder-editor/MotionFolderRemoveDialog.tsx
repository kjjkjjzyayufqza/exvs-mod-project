import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type MotionFolderRemoveDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectionCount: number;
  busy?: boolean;
  onConfirm: (deleteFilesOnDisk: boolean) => Promise<void>;
};

export function MotionFolderRemoveDialog({
  open: dialogOpen,
  onOpenChange,
  selectionCount,
  busy = false,
  onConfirm,
}: MotionFolderRemoveDialogProps) {
  const { t } = useTranslation("test-motion-folder-panels");
  const [deleteFilesOnDisk, setDeleteFilesOnDisk] = useState(false);

  useEffect(() => {
    if (!dialogOpen) return;
    setDeleteFilesOnDisk(false);
  }, [dialogOpen]);

  return (
    <Dialog open={dialogOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("remove.title", { count: selectionCount })}</DialogTitle>
          <DialogDescription>{t("remove.description", { count: selectionCount })}</DialogDescription>
        </DialogHeader>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={deleteFilesOnDisk}
            onCheckedChange={(checked) => setDeleteFilesOnDisk(Boolean(checked))}
          />
          {t("remove.deleteFromDisk")}
        </label>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("actions.cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy || selectionCount === 0}
            onClick={() => void onConfirm(deleteFilesOnDisk).then(() => onOpenChange(false))}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t("actions.remove")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
