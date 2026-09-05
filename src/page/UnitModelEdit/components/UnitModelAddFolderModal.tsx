import { FolderPlus, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  EXVS_COMMON_NEW_SHL_MODEL_TYPE,
  parseExvsCommonRuntimeModelId,
} from "../utils/exvsCommonService";
import type { UnitModelSourceValidation } from "../utils/unitModelModelService";
import {
  UnitModelSourceValidationPreview,
  type UnitModelSourceTexturePlan,
} from "./UnitModelSourceValidationPreview";

const DIMENSIONS = {
  width: 640,
  height: 620,
  minWidth: 520,
  minHeight: 420,
};

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
  const { t } = useTranslation("unit-add-extract");
  const missingTextureCount = texturePlan?.missing.length ?? 0;
  let modelIdError: string | null = null;
  if (exvsCommon) {
    try {
      parseExvsCommonRuntimeModelId(modelIdText);
    } catch (error) {
      modelIdError = String(error);
    }
  }

  if (!open) return null;

  return (
    <AppRndModalShell
      titleId="unit-model-add-folder-title"
      title={t("addFolder.title")}
      subtitle={t("addFolder.subtitle")}
      headerIcon={<FolderPlus className="h-5 w-5 text-primary" />}
      dimensions={DIMENSIONS}
      storageKey="app.rnd-size.unit-model-add-folder"
      onClose={onCancel}
      closeDisabled={busy}
      footer={
        <div className="flex justify-end gap-2 p-3">
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            disabled={busy || duplicateName || missingTextureCount > 0 || !validation || Boolean(modelIdError)}
            onClick={onConfirm}
          >
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            {busy ? t("addFolder.adding") : t("addFolder.addModel")}
          </Button>
        </div>
      }
    >
      {validation ? (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <UnitModelSourceValidationPreview
            validation={validation}
            duplicateName={duplicateName}
            texturePlan={texturePlan}
          />
          {exvsCommon ? (
            <div className="space-y-1.5 rounded-md bg-muted/30 p-3">
              <Label htmlFor="exvs-common-model-id">{t("addFolder.runtimeModelId")}</Label>
              <Input
                id="exvs-common-model-id"
                value={modelIdText}
                placeholder="0x48415431"
                className="font-mono tabular-nums"
                onChange={(event) => onModelIdTextChange?.(event.target.value)}
                disabled={busy}
              />
              <p className="text-[11px] text-muted-foreground">
                {t("addFolder.commonShlHint", { type: EXVS_COMMON_NEW_SHL_MODEL_TYPE })}
              </p>
              {modelIdError ? <p className="text-[11px] text-destructive">{modelIdError}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </AppRndModalShell>
  );
}
