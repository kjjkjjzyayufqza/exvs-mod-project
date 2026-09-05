import { useEffect, useState } from "react";
import { confirm } from "@tauri-apps/plugin-dialog";
import { Loader2, PackageCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import type {
  UnitModelRepackResult,
  UnitModelValidationResult,
} from "../utils/unitModelRepackService";
import {
  commonValidationAsUnitModel,
  repackExvsCommonBundle,
  validateExvsCommonBundle,
} from "../utils/exvsCommonService";

const DIMENSIONS = {
  width: 560,
  height: 440,
  minWidth: 480,
  minHeight: 360,
};

type ExvsCommonRepackDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelRoot: string | null;
  structurePath: string | null;
  modFolder: string;
  onValidationResult: (result: UnitModelValidationResult) => void;
  onRepacked: (result: UnitModelRepackResult) => void;
};

export function ExvsCommonRepackDialog({
  open,
  onOpenChange,
  modelRoot,
  structurePath,
  modFolder,
  onValidationResult,
  onRepacked,
}: ExvsCommonRepackDialogProps) {
  const { t } = useTranslation("unit-common-dialogs");
  const [validation, setValidation] = useState<UnitModelValidationResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !modelRoot || !structurePath) return;
    let cancelled = false;
    setBusy(true);
    void validateExvsCommonBundle(modelRoot, structurePath)
      .then((result) => {
        if (cancelled) return;
        const mapped = commonValidationAsUnitModel(result);
        setValidation(mapped);
        onValidationResult(mapped);
      })
      .catch((error) => {
        if (!cancelled) toast.error(t("repack.toast.validationFailed"), { description: String(error) });
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [modelRoot, onValidationResult, open, structurePath]);

  const repack = async () => {
    if (!modelRoot || !structurePath) return;
    setBusy(true);
    try {
      const latest = await validateExvsCommonBundle(modelRoot, structurePath);
      const mapped = commonValidationAsUnitModel(latest);
      setValidation(mapped);
      onValidationResult(mapped);
      if (!latest.valid) {
        toast.error(t("repack.toast.blocked"), {
          description: latest.errors[0]?.message,
        });
        return;
      }
      const highRisk = latest.warnings.some((warning) => warning.includes("High-risk"));
      let confirmed = false;
      if (highRisk) {
        confirmed = await confirm(
          [
            t("repack.confirm.changed"),
            "",
            ...latest.warnings.filter((warning) => warning.includes("High-risk")).slice(0, 4),
            "",
            t("repack.confirm.destination"),
          ].join("\n"),
          { title: t("repack.confirm.title"), kind: "warning" },
        );
        if (!confirmed) return;
      }
      const result = await repackExvsCommonBundle({
        modelRoot,
        structureJsonPath: structurePath,
        obModPath: modFolder,
        confirmHighRisk: confirmed,
      });
      onRepacked(result);
      toast.success(t("repack.toast.repacked"), { description: result.outputPath });
      onOpenChange(false);
    } catch (error) {
      toast.error(t("repack.toast.failed"), { description: String(error) });
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <AppRndModalShell
      titleId="exvs-common-repack-title"
      title={t("repack.title")}
      subtitle={t("repack.subtitle")}
      headerIcon={<PackageCheck className="h-5 w-5 text-primary" />}
      dimensions={DIMENSIONS}
      storageKey="app.rnd-size.exvs-common-repack"
      onClose={() => onOpenChange(false)}
      closeDisabled={busy}
      footer={
        <div className="flex justify-end gap-2 p-3">
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button disabled={busy || !validation?.valid || !modFolder.trim()} onClick={() => void repack()}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PackageCheck className="mr-1.5 h-4 w-4" />}
            {t("repack.action")}
          </Button>
        </div>
      }
    >
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-xs">
        <div className="rounded-md bg-muted/20 p-3">
          <div className="text-muted-foreground">{t("repack.destination")}</div>
          <div className="break-all font-mono text-[11px] tabular-nums">
            {modFolder ? `${modFolder.replace(/[\\/]+$/, "")}\\0xCB665375.fhm2d` : t("repack.pathNotConfigured")}
          </div>
        </div>
        {busy && !validation ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("repack.validating")}
          </div>
        ) : validation?.valid ? (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-emerald-600">
            {t("repack.validationPassed", { count: validation.warnings.length })}
          </div>
        ) : validation ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-destructive">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{validation.errors[0]?.message ?? t("repack.validationFailed")}</span>
          </div>
        ) : null}
      </div>
    </AppRndModalShell>
  );
}
