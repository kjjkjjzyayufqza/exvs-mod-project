import { useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { TestTreeNode } from "../../types";
import {
  ssbhReadNumdlbMapping,
  ssbhWriteNumdlbMapping,
  type NumdlbReadResult,
} from "./ssbhDaeIoService";
import { NumdlbMappingEditorBody } from "./NumdlbMappingEditorBody";
import { assertNumdlbValidForSave } from "./numdlbEditorUtils";

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
    return (
      <p className="text-[11px] text-muted-foreground">
        Select a `.numdlb` file from the file list to edit its mapping.
      </p>
    );
  }

  if (loading) {
    return <p className="text-[11px] text-muted-foreground">Loading `.numdlb` mapping...</p>;
  }

  if (!data || !selected) {
    return <p className="text-[11px] text-muted-foreground">No `.numdlb` data available.</p>;
  }

  return (
    <div className="space-y-4">
      <NumdlbMappingEditorBody data={data} onChange={setData} disabled={saving} />

      <Button
        type="button"
        className="h-9 w-full text-[10px] uppercase tracking-wide"
        disabled={saving}
        onClick={() => {
          try {
            assertNumdlbValidForSave(data);
          } catch (e) {
            toast.error(String(e));
            return;
          }
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
