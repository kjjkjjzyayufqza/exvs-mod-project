import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { SCENE_EXPORT_DAE_FOLDER_DIALOG_PATH_KEY } from "../utils/sceneEditorSettings";

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
}

export function DaeExportDialog({
  open,
  targets,
  onExport,
  onCancel,
}: DaeExportDialogProps) {
  const [scaleFactor, setScaleFactor] = useState(1.0);
  const [upAxis, setUpAxis] = useState<"y_up" | "z_up">("y_up");
  const [exportTextures, setExportTextures] = useState(false);
  const [exportDae, setExportDae] = useState(true);
  const [exportFbx, setExportFbx] = useState(true);
  const [outputDirectory, setOutputDirectory] = useState("");

  const ssbhCount = targets.filter((t) => t.type === "ssbh").length;
  const daeCount = targets.filter((t) => t.type === "imported-dae").length;
  const hasFormat = exportDae || exportFbx;
  const canExport = hasFormat && outputDirectory.trim().length > 0;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getStoredDialogDefaultPath(SCENE_EXPORT_DAE_FOLDER_DIALOG_PATH_KEY).then((path) => {
      if (!cancelled && path) setOutputDirectory(path);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const chooseOutputDirectory = async () => {
    const selected = await openDialog({
      directory: true,
      title: "Select model export folder",
      defaultPath: outputDirectory || (await getStoredDialogDefaultPath(SCENE_EXPORT_DAE_FOLDER_DIALOG_PATH_KEY)),
    });
    if (typeof selected !== "string" || !selected.trim()) return;
    setOutputDirectory(selected);
    await rememberStoredDialogSelection(SCENE_EXPORT_DAE_FOLDER_DIALOG_PATH_KEY, selected, "directory");
  };

  const submit = () => {
    if (!canExport) return;
    onExport({
      scaleFactor,
      upAxis,
      exportTextures,
      formats: [
        ...(exportDae ? ["dae" as const] : []),
        ...(exportFbx ? ["fbx" as const] : []),
      ],
      outputDirectory: outputDirectory.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export Model
          </DialogTitle>
          <DialogDescription>
            {targets.length === 1
              ? targets[0].name
              : `${targets.length} objects selected`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs space-y-1">
            {ssbhCount > 0 && (
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">{ssbhCount}</span> SSBH model{ssbhCount > 1 ? "s" : ""} (Rust backend export)
              </p>
            )}
            {daeCount > 0 && (
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">{daeCount}</span> imported static mesh object{daeCount > 1 ? "s" : ""}
              </p>
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

          <div className="grid grid-cols-2 gap-2">
            <label className="flex h-8 items-center gap-2 rounded-md border px-2 text-xs">
              <Checkbox
                checked={exportDae}
                onCheckedChange={(v) => setExportDae(v === true)}
              />
              DAE
            </label>
            <label className="flex h-8 items-center gap-2 rounded-md border px-2 text-xs">
              <Checkbox
                checked={exportFbx}
                onCheckedChange={(v) => setExportFbx(v === true)}
              />
              FBX
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
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

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={!canExport}>
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
