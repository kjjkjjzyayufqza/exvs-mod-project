import { useState } from "react";
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
import { Download } from "lucide-react";

export interface DaeExportConfig {
  scaleFactor: number;
  upAxis: "y_up" | "z_up";
  exportTextures: boolean;
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

  const ssbhCount = targets.filter((t) => t.type === "ssbh").length;
  const daeCount = targets.filter((t) => t.type === "imported-dae").length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export DAE
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
                <span className="font-medium text-foreground">{daeCount}</span> imported DAE object{daeCount > 1 ? "s" : ""}
              </p>
            )}
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

          {ssbhCount > 0 && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="export-textures"
                checked={exportTextures}
                onCheckedChange={(v) => setExportTextures(v === true)}
              />
              <Label htmlFor="export-textures" className="text-xs cursor-pointer">
                Export textures (PNG alongside DAE)
              </Label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => onExport({ scaleFactor, upAxis, exportTextures })}>
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
