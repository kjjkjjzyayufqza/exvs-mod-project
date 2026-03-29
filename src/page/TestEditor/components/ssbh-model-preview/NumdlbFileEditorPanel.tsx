import { useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TestTreeNode } from "../../types";
import {
  ssbhReadNumdlbMapping,
  ssbhWriteNumdlbMapping,
  type NumdlbReadResult,
} from "./ssbhDaeIoService";
import { NumdlbMaterialMappingEditor } from "./components/NumdlbMaterialMappingEditor";

type NumdlbFileEditorPanelProps = {
  selected: TestTreeNode | null | undefined;
};

export function NumdlbFileEditorPanel({ selected }: NumdlbFileEditorPanelProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<NumdlbReadResult | null>(null);

  const isNumdlb = useMemo(
    () => !!selected && !selected.isDir && selected.name.toLowerCase().endsWith(".numdlb"),
    [selected],
  );

  useEffect(() => {
    if (!selected?.path || !isNumdlb) {
      setData(null);
      return;
    }
    setLoading(true);
    void ssbhReadNumdlbMapping(selected.path)
      .then((result) => setData(result))
      .catch((error) => {
        setData(null);
        toast.error(String(error));
      })
      .finally(() => setLoading(false));
  }, [isNumdlb, selected?.path]);

  if (!isNumdlb) {
    return <p className="text-[11px] text-muted-foreground">Select a `.numdlb` file from the file list to edit its mapping.</p>;
  }

  if (loading) {
    return <p className="text-[11px] text-muted-foreground">Loading `.numdlb` mapping...</p>;
  }

  if (!data || !selected) {
    return <p className="text-[11px] text-muted-foreground">No `.numdlb` data available.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Model name</Label>
          <Input value={data.modelName} onChange={(event) => setData((current) => (current ? { ...current, modelName: event.target.value } : current))} className="h-8 text-[11px]" />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Mesh file name</Label>
          <Input value={data.meshFileName} onChange={(event) => setData((current) => (current ? { ...current, meshFileName: event.target.value } : current))} className="h-8 text-[11px]" />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Skeleton file name</Label>
          <Input value={data.skeletonFileName} onChange={(event) => setData((current) => (current ? { ...current, skeletonFileName: event.target.value } : current))} className="h-8 text-[11px]" />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Animation file name</Label>
          <Input value={data.animationFileName ?? ""} onChange={(event) => setData((current) => (current ? { ...current, animationFileName: event.target.value || null } : current))} className="h-8 text-[11px]" />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">Material file names</Label>
        <Input
          value={data.materialFileNames.join(", ")}
          onChange={(event) =>
            setData((current) =>
              current
                ? {
                    ...current,
                    materialFileNames: event.target.value
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean),
                  }
                : current,
            )
          }
          className="h-8 text-[11px]"
        />
      </div>

      <NumdlbMaterialMappingEditor
        rows={data.entries}
        onChangeMaterialLabel={(rowIndex, nextLabel) =>
          setData((current) =>
            current
              ? {
                  ...current,
                  entries: current.entries.map((row, index) => (index === rowIndex ? { ...row, materialLabel: nextLabel } : row)),
                }
              : current,
          )
        }
        onReplaceAll={(nextLabel, rowIndices) => {
          const trimmed = nextLabel.trim();
          if (!trimmed) {
            throw new Error("replaceAllMaterialLabels: nextLabel must be non-empty");
          }
          if (rowIndices.length === 0) {
            throw new Error("replaceAllMaterialLabels: rowIndices must not be empty");
          }
          const indexSet = new Set(rowIndices);
          setData((current) =>
            current
              ? {
                  ...current,
                  entries: current.entries.map((row, index) =>
                    indexSet.has(index) ? { ...row, materialLabel: trimmed } : row,
                  ),
                }
              : current,
          );
        }}
      />

      <Button
        type="button"
        className="h-9 w-full text-[10px] uppercase tracking-wide"
        disabled={saving}
        onClick={() => {
          setSaving(true);
          void ssbhWriteNumdlbMapping({
            filePath: selected.path,
            modelName: data.modelName,
            skeletonFileName: data.skeletonFileName,
            materialFileNames: data.materialFileNames,
            meshFileName: data.meshFileName,
            animationFileName: data.animationFileName,
            entries: data.entries,
          })
            .then(() => toast.success("Saved `.numdlb` mapping"))
            .catch((error) => toast.error(String(error)))
            .finally(() => setSaving(false));
        }}
      >
        <Save className="mr-1 h-3.5 w-3.5" />
        {saving ? "Saving..." : "Save NUMDLB"}
      </Button>
    </div>
  );
}
