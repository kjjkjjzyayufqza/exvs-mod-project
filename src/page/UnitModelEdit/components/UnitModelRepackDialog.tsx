import { useEffect, useMemo, useState } from "react";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Loader2, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { Fhm2dMetadataSummary } from "@/components/fhm2d-metadata";
import {
  inferUnitModelModOutputPath,
  repackValidatedUnitModelFolderToModFolder,
  validateUnitModelForRepack,
  type UnitModelRepackResult,
  type UnitModelValidationResult,
} from "../utils/unitModelRepackService";
import { buildRepackOutputPathFromMetadata } from "@/utils/repackRunner";
import { normalizeFhm2dHashName } from "@/utils/fhm2dStructureMetadata";

const UNIT_MODEL_REPACK_DIMENSIONS = {
  width: 560,
  height: 440,
  minWidth: 480,
  minHeight: 360,
};

type UnitModelRepackDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelRoot: string | null;
  structurePath: string | null;
  modFolder: string;
  folderName: string;
  validation: UnitModelValidationResult | null;
  isValidating: boolean;
  onValidationResult: (result: UnitModelValidationResult) => void;
  onRepacked: (result: UnitModelRepackResult) => void;
};

/**
 * Confirmation dialog mirroring the Test Editor "Repack Changes" flow, but
 * targeting a single unit-model folder. Validates first, then packs the
 * `.fhm2d` into the configured OB Mod folder.
 */
export function UnitModelRepackDialog({
  open,
  onOpenChange,
  modelRoot,
  structurePath,
  modFolder,
  folderName,
  validation,
  isValidating,
  onValidationResult,
  onRepacked,
}: UnitModelRepackDialogProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [metadataDestination, setMetadataDestination] = useState<string | null>(null);

  const modFolderConfigured = modFolder.trim().length > 0;
  const fallbackDestination = useMemo(() => {
    if (!modFolderConfigured || !structurePath) return null;
    try {
      return inferUnitModelModOutputPath(modFolder, structurePath);
    } catch {
      return null;
    }
  }, [modFolderConfigured, modFolder, structurePath]);
  useEffect(() => {
    let cancelled = false;
    setMetadataDestination(null);
    if (!modFolderConfigured || !structurePath) return () => {
      cancelled = true;
    };
    void buildRepackOutputPathFromMetadata(structurePath, modFolder)
      .then((nextDestination) => {
        if (!cancelled) setMetadataDestination(nextDestination);
      })
      .catch(() => {
        if (!cancelled) setMetadataDestination(null);
      });
    return () => {
      cancelled = true;
    };
  }, [modFolderConfigured, modFolder, structurePath]);
  const destination = metadataDestination ?? fallbackDestination;
  const hashNamePreview = normalizeFhm2dHashName(destination ?? structurePath);

  const canRepack =
    Boolean(modelRoot && structurePath && destination && validation?.valid) && !isRunning && !isValidating;

  const handleConfirm = async () => {
    if (!modelRoot || !structurePath) {
      toast.error("No unit model folder selected");
      return;
    }
    if (!modFolderConfigured) {
      toast.error("OB Mod folder is not configured", {
        description: "Set the OB Mod path in Config before repacking.",
      });
      return;
    }
    setIsRunning(true);
    try {
      const latestValidation = await validateUnitModelForRepack(modelRoot, structurePath);
      onValidationResult(latestValidation);
      if (!latestValidation.valid) {
        const firstIssue = latestValidation.errors[0]?.message;
        toast.error("Repack blocked by validation", {
          description: firstIssue ?? `${latestValidation.errors.length} issue(s) must be fixed first`,
        });
        return;
      }
      const result = await repackValidatedUnitModelFolderToModFolder(modFolder, structurePath);
      onRepacked(result);
      toast.success("Unit model repacked to OB Mod folder", {
        description: result.removedVgsht2
          ? `${result.outputPath} (removed matching .vgsht2)`
          : result.outputPath,
      });
      onOpenChange(false);
    } catch (error) {
      toast.error("Unit model repack failed", { description: String(error) });
    } finally {
      setIsRunning(false);
    }
  };

  if (!open) return null;

  return (
    <AppRndModalShell
      titleId="unit-model-repack-title"
      title="Repack Changes"
      subtitle="Validate and repack the unit model into the configured OB Mod folder"
      headerIcon={<PackageCheck className="h-5 w-5 text-primary" />}
      dimensions={UNIT_MODEL_REPACK_DIMENSIONS}
      storageKey="app.rnd-size.unit-model-repack"
      onClose={() => onOpenChange(false)}
      closeDisabled={isRunning}
      footer={
        <div className="flex justify-end gap-2 p-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isRunning}>
            Cancel
          </Button>
          <Button onClick={() => void handleConfirm()} disabled={!canRepack}>
            <PackageCheck className="mr-2 h-4 w-4" />
            {isRunning ? "Repacking..." : "Repack"}
          </Button>
        </div>
      }
    >
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <Fhm2dMetadataSummary
          compact
          name={folderName || "Unit model"}
          hashName={hashNamePreview}
          folderPath={modelRoot}
          structureJsonPath={structurePath}
          repackOutputPath={destination}
        />

        {modFolderConfigured && destination ? null : (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              OB Mod path is not configured. Open <span className="font-medium">Config</span> and set the OB Mod
              folder before repacking.
            </span>
          </div>
        )}

        <ValidationGate validation={validation} isValidating={isValidating} />
      </div>
    </AppRndModalShell>
  );
}

function ValidationGate({
  validation,
  isValidating,
}: {
  validation: UnitModelValidationResult | null;
  isValidating: boolean;
}) {
  if (isValidating) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-2.5 text-xs text-primary">
        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
        <div>
          <div className="font-semibold">Checking validation before repack</div>
          <div className="mt-1 text-primary/80">The Repack button is enabled after validation passes.</div>
        </div>
      </div>
    );
  }

  if (!validation) {
    return (
      <div className="flex items-start gap-2 rounded-md border bg-muted/20 p-2.5 text-xs text-muted-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <div className="font-semibold text-foreground">Waiting for validation</div>
          <div className="mt-1">Validation runs automatically after opening or editing a Unit Model folder.</div>
        </div>
      </div>
    );
  }

  if (validation.errors.length === 0) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-xs text-emerald-600">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <div className="font-semibold">Validation passed</div>
          {validation.warnings.length ? (
            <div className="mt-1 text-emerald-700/80 dark:text-emerald-400/80">
              {validation.warnings.length} warning(s) will be kept as non-blocking notes.
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-xs">
      <div className="flex items-start gap-2 text-destructive">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <div className="font-semibold">Repack blocked by {validation.errors.length} issue(s)</div>
          <div className="mt-1 text-destructive/80">Fix these issues in the Unit Model structure before repacking.</div>
        </div>
      </div>
      <div className="mt-2 space-y-1.5">
        {validation.errors.slice(0, 5).map((issue, index) => (
          <div
            key={`${issue.phase}:${issue.model ?? ""}:${issue.path ?? ""}:${index}`}
            className="rounded border bg-background/80 p-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-destructive">{issue.phase}</span>
              {issue.model ? <span className="truncate font-mono text-muted-foreground">{issue.model}</span> : null}
            </div>
            <div className="mt-1 text-foreground">{issue.message}</div>
            {issue.path ? (
              <div className="mt-1 break-all font-mono text-[10px] text-muted-foreground">{issue.path}</div>
            ) : null}
          </div>
        ))}
        {validation.errors.length > 5 ? (
          <div className="text-[11px] text-muted-foreground">
            Showing 5 of {validation.errors.length}. See the right Details panel for the full list.
          </div>
        ) : null}
      </div>
    </div>
  );
}
