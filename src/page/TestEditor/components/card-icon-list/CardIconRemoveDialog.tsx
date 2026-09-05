import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { CardIconItem } from "./cardIconStructure";
import { useTranslation } from "react-i18next";

interface CardIconRemoveDialogProps {
  item: CardIconItem;
  onConfirm: () => void;
  disabled?: boolean;
}

export function CardIconRemoveDialog({ item, onConfirm, disabled = false }: CardIconRemoveDialogProps) {
  const { t } = useTranslation("test-lists");
  const label = item.name ?? t("cardIcon.emptyParen");
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled}>
          {t("common.remove")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("cardIcon.removeTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("cardIcon.removeNamed", { name: label, index: item.itemIndex })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={disabled} className="bg-red-600 hover:bg-red-700">
            {t("common.remove")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
