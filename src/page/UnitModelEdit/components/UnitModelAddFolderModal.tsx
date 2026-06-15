import { FolderPlus, Loader2 } from "lucide-react";

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
import type { UnitModelSourceValidation } from "../utils/unitModelModelService";
import {
  UnitModelSourceValidationPreview,
  type UnitModelSourceTexturePlan,
} from "./UnitModelSourceValidationPreview";

type UnitModelAddFolderModalProps = {
  open: boolean;
  validation: UnitModelSourceValidation | null;
  duplicateName: boolean;
  texturePlan: UnitModelSourceTexturePlan | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Validation preview shown before committing an "Add SSBH folder". Lets the operator confirm the
 * derived model name, required files, and which textures get copied vs must come from the pool,
 * instead of the old validate-then-add-immediately one-shot.
 */
export function UnitModelAddFolderModal({
  open,
  validation,
  duplicateName,
  texturePlan,
  busy,
  onConfirm,
  onCancel,
}: UnitModelAddFolderModalProps) {
  const missingTextureCount = texturePlan?.missing.length ?? 0;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
    >
      <AlertDialogContent className="max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <FolderPlus className="h-4 w-4 text-primary" aria-hidden />
            Add model from folder
          </AlertDialogTitle>
          <AlertDialogDescription>
            Review the prepared SSBH folder before it is copied into the package as a new model.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {validation ? (
          <div className="max-h-[55vh] overflow-y-auto pr-1">
            <UnitModelSourceValidationPreview
              validation={validation}
              duplicateName={duplicateName}
              texturePlan={texturePlan}
            />
          </div>
        ) : null}

        <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel type="button" disabled={busy} onClick={onCancel}>
            Cancel
          </AlertDialogCancel>
          <Button
            type="button"
            disabled={busy || duplicateName || missingTextureCount > 0 || !validation}
            onClick={onConfirm}
          >
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            {busy ? "Adding..." : "Add model"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
