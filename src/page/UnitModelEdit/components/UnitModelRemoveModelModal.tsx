import { useEffect, useState } from "react";
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
                Remove model?
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-left text-sm text-muted-foreground">
                  <p>
                    You are about to remove <span className="font-mono text-foreground">{label}</span>{" "}
                    from this Unit model package.
                  </p>
                  <p>
                    This deletes the model&apos;s SSBH files, its paired NUHLPB, and any shared textures
                    that become unreferenced. The package structure JSON will be rewritten.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
              <AlertDialogCancel type="button" disabled={busy} onClick={onCancel}>
                Cancel
              </AlertDialogCancel>
              <Button
                type="button"
                variant="destructive"
                disabled={!label || busy}
                onClick={() => setStep(2)}
              >
                Continue
              </Button>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" aria-hidden />
                Permanently remove model?
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-left text-sm text-muted-foreground">
                  <p>
                    Final confirmation: <span className="font-mono text-foreground">{label}</span> will be
                    deleted from disk. This cannot be undone.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" disabled={busy} onClick={() => setStep(1)}>
                Back
              </Button>
              <AlertDialogCancel type="button" disabled={busy} onClick={onCancel}>
                Cancel
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
                    Removing...
                  </>
                ) : (
                  "Permanently remove"
                )}
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
