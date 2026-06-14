import { useMemo, useState } from "react";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { AlertTriangle, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import {
  inferUnitModelModOutputPath,
  repackValidatedUnitModelFolderToModFolder,
  validateUnitModelForRepack,
  type UnitModelRepackResult,
} from "../utils/unitModelRepackService";

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
  onRepacked,
}: UnitModelRepackDialogProps) {
  const [isRunning, setIsRunning] = useState(false);

  const modFolderConfigured = modFolder.trim().length > 0;
  const destination = useMemo(() => {
    if (!modFolderConfigured || !structurePath) return null;
    try {
      return inferUnitModelModOutputPath(modFolder, structurePath);
    } catch {
      return null;
    }
  }, [modFolderConfigured, modFolder, structurePath]);

  const canRepack = Boolean(modelRoot && structurePath && destination) && !isRunning;

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
      const validation = await validateUnitModelForRepack(modelRoot, structurePath);
      if (!validation.valid) {
        toast.error("Repack blocked by validation", {
          description: `${validation.errors.length} issue(s) must be fixed first`,
        });
        return;
      }
      const result = await repackValidatedUnitModelFolderToModFolder(modFolder, structurePath);
      onRepacked(result);
      toast.success("Unit model repacked to OB Mod folder", { description: result.outputPath });
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
          <div className="rounded-md border p-2.5 text-sm">
            <div className="font-medium">{folderName || "Unit model"}</div>
            <div className="mt-1 break-all font-mono text-xs text-muted-foreground">
              {structurePath ?? "No structure JSON resolved"}
            </div>
          </div>

          <div className="rounded-md border p-2.5 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Destination (OB Mod folder)
            </div>
            {modFolderConfigured && destination ? (
              <div className="mt-1 break-all font-mono text-xs">{destination}</div>
            ) : (
              <div className="mt-1 flex items-start gap-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  OB Mod path is not configured. Open <span className="font-medium">Config</span> and set the
                  OB Mod folder before repacking.
                </span>
              </div>
            )}
          </div>
      </div>
    </AppRndModalShell>
  );
}
