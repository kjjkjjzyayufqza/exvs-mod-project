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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseExvsCommonRuntimeModelId } from "../utils/exvsCommonService";
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
  exvsCommon?: boolean;
  modelIdText?: string;
  onModelIdTextChange?: (value: string) => void;
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
  exvsCommon = false,
  modelIdText = "",
  onModelIdTextChange,
}: UnitModelAddFolderModalProps) {
  const missingTextureCount = texturePlan?.missing.length ?? 0;
  let modelIdError: string | null = null;
  if (exvsCommon) {
    try {
      parseExvsCommonRuntimeModelId(modelIdText);
    } catch (error) {
      modelIdError = String(error);
    }
  }

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
          <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
            <UnitModelSourceValidationPreview
              validation={validation}
              duplicateName={duplicateName}
              texturePlan={texturePlan}
            />
            {exvsCommon ? (
              <div className="space-y-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                <Label htmlFor="exvs-common-model-id">Runtime model ID (u32 hex)</Label>
                <Input
                  id="exvs-common-model-id"
                  value={modelIdText}
                  placeholder="0x48415431"
                  className="font-mono"
                  onChange={(event) => onModelIdTextChange?.(event.target.value)}
                  disabled={busy}
                />
                <p className="text-[11px] text-muted-foreground">
                  Must be unique in the Common SHL. A type-6 record is added automatically.
                </p>
                {modelIdError ? <p className="text-[11px] text-destructive">{modelIdError}</p> : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel type="button" disabled={busy} onClick={onCancel}>
            Cancel
          </AlertDialogCancel>
          <Button
            type="button"
            disabled={busy || duplicateName || missingTextureCount > 0 || !validation || Boolean(modelIdError)}
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
