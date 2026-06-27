import { useEffect, useMemo, useState, type ReactNode } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Download, FolderOpen } from "lucide-react";
import {
  getStoredDialogDefaultPath,
  rememberStoredDialogSelection,
} from "@/utils/dialogDefaultPathStore";
import { resolveDaeExportFormatDefaults } from "../utils/daeExportDialogState";
import { SCENE_EXPORT_DAE_FOLDER_DIALOG_PATH_KEY } from "../utils/sceneEditorSettings";

const DAE_EXPORT_DIMENSIONS = {
  width: 520,
  height: 570,
  minWidth: 440,
  minHeight: 480,
};

export type ModelExportFormat = "dae" | "fbx";

export interface DaeExportConfig {
  scaleFactor: number;
  upAxis: "y_up" | "z_up";
  exportTextures: boolean;
  formats: ModelExportFormat[];
  outputDirectory: string;
}

export interface DaeExportTarget {
  nodeId: string;
  name: string;
  rootPath: string | null;
  type: "ssbh" | "imported-dae";
}

interface DaeExportDialogProps {
  open: boolean;
  targets: DaeExportTarget[];
  onExport: (config: DaeExportConfig) => void;
  onCancel: () => void;
  /** Tauri `dialogDefaultPath` key for the output folder picker. */
  outputDialogPathKey?: string;
  subtitle?: string;
  summaryContent?: ReactNode;
  formatHint?: string;
  /** Initial format checkbox state whenever the dialog opens. Defaults to DAE + FBX. */
  defaultFormats?: ModelExportFormat[];
  /** Limit the selectable export formats for callers that only support a subset. */
  availableFormats?: ModelExportFormat[];
  /** Initial texture export checkbox state whenever the dialog opens. */
  defaultExportTextures?: boolean;
}

export function DaeExportDialog({
  open,
  targets,
  onExport,
  onCancel,
  outputDialogPathKey = SCENE_EXPORT_DAE_FOLDER_DIALOG_PATH_KEY,
  subtitle,
  summaryContent,
  formatHint,
  defaultFormats,
  availableFormats,
  defaultExportTextures = false,
}: DaeExportDialogProps) {
  const [scaleFactor, setScaleFactor] = useState(1.0);
  const [upAxis, setUpAxis] = useState<"y_up" | "z_up">("y_up");
  const [exportTextures, setExportTextures] = useState(false);
  const [exportDae, setExportDae] = useState(true);
  const [exportFbx, setExportFbx] = useState(true);
  const [outputDirectory, setOutputDirectory] = useState("");
  const enabledFormats = useMemo(
    () => (availableFormats && availableFormats.length > 0
      ? [...new Set(availableFormats)]
      : (["dae", "fbx"] as const)),
    [availableFormats],
  );
  const supportsDae = enabledFormats.includes("dae");
  const supportsFbx = enabledFormats.includes("fbx");
  const showFormatSelector = enabledFormats.length > 1;

  useEffect(() => {
    if (!open) return;
    const defaults = resolveDaeExportFormatDefaults(defaultFormats, enabledFormats);
    setExportDae(defaults.exportDae);
    setExportFbx(defaults.exportFbx);
    setExportTextures(defaultExportTextures);
  }, [open, defaultFormats, enabledFormats, defaultExportTextures]);

  const ssbhCount = targets.filter((t) => t.type === "ssbh").length;
  const daeCount = targets.filter((t) => t.type === "imported-dae").length;
  const hasFormat = (supportsDae && exportDae) || (supportsFbx && exportFbx);
  const canExport = hasFormat && outputDirectory.trim().length > 0;
  const resolvedSubtitle =
    subtitle ?? (targets.length === 1 ? (targets[0]?.name ?? "Export target") : `${targets.length} objects selected`);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getStoredDialogDefaultPath(outputDialogPathKey).then((path) => {
      if (!cancelled && path) setOutputDirectory(path);
    });
    return () => {
      cancelled = true;
    };
  }, [open, outputDialogPathKey]);

  const chooseOutputDirectory = async () => {
    const selected = await openDialog({
      directory: true,
      title: "Select model export folder",
      defaultPath: outputDirectory || (await getStoredDialogDefaultPath(outputDialogPathKey)),
    });
    if (typeof selected !== "string" || !selected.trim()) return;
    setOutputDirectory(selected);
    await rememberStoredDialogSelection(outputDialogPathKey, selected, "directory");
  };

  const submit = () => {
    if (!canExport) return;
    onExport({
      scaleFactor,
      upAxis,
      exportTextures,
      formats: [
        ...(supportsDae && exportDae ? ["dae" as const] : []),
        ...(supportsFbx && exportFbx ? ["fbx" as const] : []),
      ],
      outputDirectory: outputDirectory.trim(),
    });
  };

  if (!open) return null;

  return (
    <AppRndModalShell
      titleId="dae-export-dialog-title"
      title="Export Model"
      subtitle={resolvedSubtitle}
      headerIcon={<Download className="h-5 w-5 text-primary" />}
      dimensions={DAE_EXPORT_DIMENSIONS}
      storageKey="app.rnd-size.dae-export"
      onClose={onCancel}
      footer={
        <div className="flex justify-end gap-2 p-3">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={!canExport}>
            Export
          </Button>
        </div>
      }
    >
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs space-y-1">
          {summaryContent ?? (
            <>
              {ssbhCount > 0 && (
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">{ssbhCount}</span> SSBH model
                  {ssbhCount > 1 ? "s" : ""} (Rust backend export)
                </p>
              )}
              {daeCount > 0 && (
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">{daeCount}</span> imported static
                  mesh object{daeCount > 1 ? "s" : ""}
                </p>
              )}
            </>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Output Directory</Label>
          <div className="flex gap-2">
            <Input
              value={outputDirectory}
              onChange={(e) => setOutputDirectory(e.target.value)}
              className="h-8 text-xs"
              placeholder="Choose export folder"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={chooseOutputDirectory}
              aria-label="Choose export folder"
            >
              <FolderOpen className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {showFormatSelector ? (
          <div className="grid grid-cols-2 gap-2">
            {supportsDae ? (
              <label className="flex h-8 items-center gap-2 rounded-md border px-2 text-xs">
                <Checkbox
                  checked={exportDae}
                  onCheckedChange={(v) => setExportDae(v === true)}
                />
                DAE
              </label>
            ) : null}
            {supportsFbx ? (
              <label className="flex h-8 items-center gap-2 rounded-md border px-2 text-xs">
                <Checkbox
                  checked={exportFbx}
                  onCheckedChange={(v) => setExportFbx(v === true)}
                />
                FBX
              </label>
            ) : null}
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label className="text-xs">Format</Label>
            <div className="flex h-8 items-center rounded-md border px-3 text-xs font-medium">
              {supportsFbx ? "FBX" : "DAE"}
            </div>
          </div>
        )}

        <div className={`grid gap-3 ${supportsDae ? "grid-cols-2" : "grid-cols-1"}`}>
          {supportsDae ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Scale Factor</Label>
              <Input
                type="number"
                min={0.001}
                step={0.1}
                value={scaleFactor}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (Number.isFinite(v) && v > 0) setScaleFactor(v);
                }}
                className="h-8 text-xs"
              />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label className="text-xs">Up Axis</Label>
            <Select value={upAxis} onValueChange={(v) => setUpAxis(v as "y_up" | "z_up")}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="y_up">Y-Up</SelectItem>
                <SelectItem value="z_up">Z-Up</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

          {formatHint ? <p className="text-[11px] text-muted-foreground">{formatHint}</p> : null}

          {targets.length > 0 && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="export-textures"
                checked={exportTextures}
                onCheckedChange={(v) => setExportTextures(v === true)}
              />
              <Label htmlFor="export-textures" className="text-xs cursor-pointer">
                Export referenced textures
              </Label>
            </div>
          )}
      </div>
    </AppRndModalShell>
  );
}
