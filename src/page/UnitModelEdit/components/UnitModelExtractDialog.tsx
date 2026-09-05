import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, FolderOutput, Loader2, PackageOpen } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { AppRndModalShell } from "@/components/AppRndModalShell";
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
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FilePathInput } from "@/components/ui/filePathInput";
import { Fhm2dMetadataSummary, Fhm2dNameField } from "@/components/fhm2d-metadata";
import { useConfigStore } from "@/store/configStore";
import {
  UNIT_MODEL_EXTRACT_OUTPUT_DIALOG_PATH_KEY,
  UNIT_MODEL_EXTRACT_SOURCE_DIALOG_PATH_KEY,
  UNIT_MODEL_OUTPUT_PATH_SETTING_KEY,
} from "../utils/unitModelEditorSettings";
import {
  buildUnitModelExtractOutRoot,
  extractUnitModelToFolder,
  getUnitModelExtractCollisionInfo,
  inferFhm2dStem,
  resolveUnitModelOutputDirectory,
  type UnitModelExtractResult,
} from "../utils/unitModelExtractService";
import {
  normalizeFhm2dHashName,
  sanitizeFhm2dStructureName,
} from "@/utils/fhm2dStructureMetadata";
import { suggestFhm2dStructureName } from "@/utils/fhm2dNameMapping";

const UNIT_MODEL_EXTRACT_DIMENSIONS = {
  width: 620,
  height: 680,
  minWidth: 520,
  minHeight: 500,
};

type UnitModelExtractDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExtracted: (result: UnitModelExtractResult) => void | Promise<void>;
};

export function UnitModelExtractDialog({ open, onOpenChange, onExtracted }: UnitModelExtractDialogProps) {
  const { t } = useTranslation("unit-add-extract");
  const extractOutputPath = useConfigStore((state) => state.extractOutputPath ?? "");
  const unitModelOutputPath = useConfigStore((state) => state.unitModelOutputPath ?? "");
  const setSetting = useConfigStore((state) => state.setSetting);

  const [sourcePath, setSourcePath] = useState("");
  const [extractName, setExtractName] = useState("");
  const [outputDirectory, setOutputDirectory] = useState("");
  const [collisionOutRoot, setCollisionOutRoot] = useState<string | null>(null);
  const [folderExists, setFolderExists] = useState(false);
  const [isCheckingCollision, setIsCheckingCollision] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [overwriteOpen, setOverwriteOpen] = useState(false);

  const resolvedDefaultOutput = useMemo(
    () => resolveUnitModelOutputDirectory(unitModelOutputPath, extractOutputPath),
    [extractOutputPath, unitModelOutputPath],
  );

  const stem = useMemo(() => (sourcePath.trim() ? inferFhm2dStem(sourcePath) : ""), [sourcePath]);
  const suggestedExtractName = useMemo(
    () =>
      suggestFhm2dStructureName(sourcePath, {
        routeId: "unit.model",
        fallbackName: stem,
      }) ?? stem,
    [sourcePath, stem],
  );
  const sanitizedExtractName = useMemo(
    () => sanitizeFhm2dStructureName(extractName || suggestedExtractName),
    [extractName, suggestedExtractName],
  );

  const previewOutRoot = useMemo(() => {
    if (!outputDirectory.trim() || !sanitizedExtractName) return null;
    try {
      return buildUnitModelExtractOutRoot(outputDirectory, sanitizedExtractName);
    } catch {
      return null;
    }
  }, [outputDirectory, sanitizedExtractName]);
  const previewStructureJson = previewOutRoot ? `${previewOutRoot}_structure.json` : null;
  const previewHashName = useMemo(() => normalizeFhm2dHashName(sourcePath), [sourcePath]);

  const refreshCollision = useCallback(async (nextSource: string, nextOutput: string) => {
    const trimmedSource = nextSource.trim();
    const trimmedOutput = nextOutput.trim();
    if (!trimmedSource || !trimmedOutput) {
      setCollisionOutRoot(null);
      setFolderExists(false);
      return;
    }
    setIsCheckingCollision(true);
    try {
      const info = await getUnitModelExtractCollisionInfo(trimmedOutput, trimmedSource, sanitizedExtractName);
      setCollisionOutRoot(info.outRoot);
      setFolderExists(info.folderExists);
    } catch (error) {
      setCollisionOutRoot(null);
      setFolderExists(false);
      console.error("Failed to check extract output collision", error);
    } finally {
      setIsCheckingCollision(false);
    }
  }, [sanitizedExtractName]);

  useEffect(() => {
    if (!open) return;
    setSourcePath("");
    setExtractName("");
    setOutputDirectory(resolvedDefaultOutput);
    setCollisionOutRoot(null);
    setFolderExists(false);
    setOverwriteOpen(false);
  }, [open, resolvedDefaultOutput]);

  useEffect(() => {
    if (!open) return;
    void refreshCollision(sourcePath, outputDirectory);
  }, [open, outputDirectory, refreshCollision, sourcePath]);

  const canExtract =
    Boolean(sourcePath.trim() && outputDirectory.trim() && sanitizedExtractName) && !isExtracting && !isCheckingCollision;

  const runExtract = async () => {
    const trimmedSource = sourcePath.trim();
    const trimmedOutput = outputDirectory.trim();
    if (!trimmedSource || !trimmedOutput) {
      toast.error(t("extract.errors.selectSourceAndOutput"));
      return;
    }

    setIsExtracting(true);
    try {
      const outRoot = buildUnitModelExtractOutRoot(trimmedOutput, sanitizedExtractName);
      const result = await extractUnitModelToFolder(trimmedSource, outRoot);
      await onExtracted(result);
      onOpenChange(false);
      toast.success(t("extract.success.title"), {
        description: t("extract.success.description", { models: result.modelCount, files: result.totalFiles }),
      });
    } catch (error) {
      toast.error(t("extract.errors.failed"), { description: String(error) });
    } finally {
      setIsExtracting(false);
      setOverwriteOpen(false);
    }
  };

  const handleExtractClick = () => {
    if (!canExtract) return;
    if (folderExists) {
      setOverwriteOpen(true);
      return;
    }
    void runExtract();
  };

  const handleOutputPicked = async (value: string | string[]) => {
    const next = Array.isArray(value) ? value[0] ?? "" : value;
    setOutputDirectory(next);
    if (next.trim()) {
      await setSetting(UNIT_MODEL_OUTPUT_PATH_SETTING_KEY, next.trim());
    }
  };

  return (
    <>
      {open ? (
        <AppRndModalShell
          titleId="unit-model-extract-title"
          title={t("extract.title")}
          subtitle={t("extract.subtitle")}
          headerIcon={<PackageOpen className="h-5 w-5 text-primary" />}
          dimensions={UNIT_MODEL_EXTRACT_DIMENSIONS}
          storageKey="app.rnd-size.unit-model-extract"
          onClose={() => onOpenChange(false)}
          closeDisabled={isExtracting}
          footer={
            <div className="flex justify-end gap-2 p-3">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isExtracting}>
                {t("common.cancel")}
              </Button>
              <Button onClick={handleExtractClick} disabled={!canExtract}>
                {isExtracting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <PackageOpen className="mr-2 h-4 w-4" />
                )}
                {isExtracting ? t("extract.extracting") : folderExists ? t("extract.extractAndOverwrite") : t("extract.extract")}
              </Button>
            </div>
          }
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <div className="space-y-2">
              <Label htmlFor="unit-model-extract-source">{t("extract.source")}</Label>
              <FilePathInput
                id="unit-model-extract-source"
                value={sourcePath}
                onChange={(event) => setSourcePath(event.target.value)}
                onPickedValue={(value) => {
                  const next = Array.isArray(value) ? value[0] ?? "" : value;
                  setSourcePath(next);
                  const nextStem = inferFhm2dStem(next);
                  setExtractName(
                    suggestFhm2dStructureName(next, {
                      routeId: "unit.model",
                      fallbackName: nextStem,
                    }) ?? sanitizeFhm2dStructureName(nextStem),
                  );
                }}
                readOnly
                placeholder={t("extract.sourcePlaceholder")}
                picker={{
                  kind: "file",
                  title: t("extract.sourcePickerTitle"),
                  filters: [{ name: "FHM2D", extensions: ["fhm2d"] }],
                  defaultPathKey: UNIT_MODEL_EXTRACT_SOURCE_DIALOG_PATH_KEY,
                }}
              />
            </div>

            <Fhm2dNameField
                id="unit-model-extract-name"
                value={extractName}
                onChange={setExtractName}
                sourceNameOrPath={sourcePath}
                routeId="unit.model"
                folderPath={previewOutRoot}
                structureJsonPath={previewStructureJson}
                description={t("extract.nameDescription")}
              />

            <div className="space-y-2">
              <Label htmlFor="unit-model-extract-output">{t("extract.outputDirectory")}</Label>
              <FilePathInput
                id="unit-model-extract-output"
                value={outputDirectory}
                onChange={(event) => setOutputDirectory(event.target.value)}
                onPickedValue={(value) => void handleOutputPicked(value)}
                readOnly
                placeholder={t("extract.outputPlaceholder")}
                storeKey={UNIT_MODEL_OUTPUT_PATH_SETTING_KEY}
                persistPickedValue
                picker={{
                  kind: "folder",
                  title: t("extract.outputPickerTitle"),
                  defaultPath: resolvedDefaultOutput || extractOutputPath || undefined,
                  defaultPathKey: UNIT_MODEL_EXTRACT_OUTPUT_DIALOG_PATH_KEY,
                }}
              />
              <p className="text-xs text-muted-foreground">
                {t("extract.outputHint")}
              </p>
            </div>

            <Fhm2dMetadataSummary
              compact
              name={sanitizedExtractName}
              hashName={previewHashName}
              folderPath={previewOutRoot}
              structureJsonPath={previewStructureJson}
            />

            {folderExists ? (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-sm text-amber-900 dark:text-amber-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-1">
                  <div className="font-medium">{t("extract.collision.title")}</div>
                  <p className="text-xs text-muted-foreground">
                    {t("extract.collision.description")}
                  </p>
                  {collisionOutRoot ? (
                    <p className="break-all font-mono text-[11px] text-foreground">{collisionOutRoot}</p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {!outputDirectory.trim() && extractOutputPath.trim() === "" ? (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {t("extract.missingOutputPath")}
                </span>
              </div>
            ) : null}
          </div>
        </AppRndModalShell>
      ) : null}

      <AlertDialog open={overwriteOpen} onOpenChange={(next) => (!isExtracting ? setOverwriteOpen(next) : undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("extract.overwrite.title")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left text-sm text-muted-foreground">
                <p>
                  {t("extract.overwrite.description")}
                </p>
                {collisionOutRoot ? (
                  <p className="break-all font-mono text-xs text-foreground">{collisionOutRoot}</p>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isExtracting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void runExtract();
              }}
              disabled={isExtracting}
            >
              {isExtracting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("extract.extracting")}
                </>
              ) : (
                <>
                  <FolderOutput className="mr-2 h-4 w-4" />
                  {t("extract.overwrite.action")}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
