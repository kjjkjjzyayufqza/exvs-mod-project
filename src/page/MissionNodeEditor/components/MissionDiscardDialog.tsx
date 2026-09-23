import { useTranslation } from "react-i18next";
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

export function MissionDiscardDialog({
  open,
  onOpenChange,
  onDiscard,
  onCancel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("mission-node-editor");
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent showCloseButton>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("discard.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("discard.openDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel type="button" onClick={onCancel}>{t("discard.cancel")}</AlertDialogCancel>
          <AlertDialogAction type="button" onClick={onDiscard}>{t("discard.confirm")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
