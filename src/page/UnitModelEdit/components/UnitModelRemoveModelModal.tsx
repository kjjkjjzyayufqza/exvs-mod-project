import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type UnitModelRemoveModelModalProps = {
  open: boolean;
  modelLabel: string | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function UnitModelRemoveModelModal({
  open,
  modelLabel,
  busy,
  onConfirm,
  onCancel,
}: UnitModelRemoveModelModalProps) {
  const { t } = useTranslation("unit-remove-repack");
  const [step, setStep] = useState<1 | 2>(1);

  useEffect(() => {
    if (!open) {
      setStep(1);
    }
  }, [open]);

  const label = modelLabel?.trim() ?? "";

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
    >
      <AlertDialogContent className="max-w-md">
        {step === 1 ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
                {t("remove.title")}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-left text-sm text-muted-foreground">
                  <p>
                    {t("remove.description", { name: label })}
                  </p>
                  <p>
                    {t("remove.details")}
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
              <AlertDialogCancel type="button" disabled={busy} onClick={onCancel}>
                {t("actions.cancel")}
              </AlertDialogCancel>
              <Button
                type="button"
                variant="destructive"
                disabled={!label || busy}
                onClick={() => setStep(2)}
              >
                {t("actions.continue")}
              </Button>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" aria-hidden />
                {t("confirm.title")}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-left text-sm text-muted-foreground">
                  <p>
                    {t("confirm.description", { name: label })}
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" disabled={busy} onClick={() => setStep(1)}>
                {t("actions.back")}
              </Button>
              <AlertDialogCancel type="button" disabled={busy} onClick={onCancel}>
                {t("actions.cancel")}
              </AlertDialogCancel>
              <Button
                type="button"
                variant="destructive"
                disabled={!label || busy}
                onClick={onConfirm}
              >
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    {t("remove.loading")}
                  </>
                ) : (
                  t("confirm.action")
                )}
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
