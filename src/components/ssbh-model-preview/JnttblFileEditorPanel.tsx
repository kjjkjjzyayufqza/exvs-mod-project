import { useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { TestTreeNode } from "@/page/TestEditor/types";
import {
  jnttblReadFile,
  jnttblWriteFile,
  type JnttblEditorDocument,
} from "./jnttblIoService";
import { JnttblEditorBody } from "./JnttblEditorBody";
import {
  assertJnttblValidForSave,
  readResultToEditorDocument,
  resolveJnttblBoneCountForSave,
} from "./jnttblEditorUtils";

type JnttblFileEditorPanelProps = {
  selected: TestTreeNode | null | undefined;
};

export function JnttblFileEditorPanel({ selected }: JnttblFileEditorPanelProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<JnttblEditorDocument | null>(null);

  const isJnttbl = useMemo(
    () => !!selected && !selected.isDir && selected.name.toLowerCase().endsWith(".jnttbl"),
    [selected],
  );

  useEffect(() => {
    if (!selected?.path || !isJnttbl) {
      setData(null);
      return;
    }
    setLoading(true);
    void jnttblReadFile(selected.path)
      .then((result) => setData(readResultToEditorDocument(result)))
      .catch((error) => {
        setData(null);
        toast.error(String(error));
      })
      .finally(() => setLoading(false));
  }, [isJnttbl, selected?.path]);

  if (!isJnttbl) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Select a `.jnttbl` file from the file list to edit the joint table.
      </p>
    );
  }

  if (loading) {
    return <p className="text-[11px] text-muted-foreground">Loading `.jnttbl`…</p>;
  }

  if (!data || !selected) {
    return <p className="text-[11px] text-muted-foreground">No `.jnttbl` data available.</p>;
  }

  return (
    <div className="space-y-4">
      <JnttblEditorBody data={data} onChange={setData} disabled={saving} />

      <Button
        type="button"
        className="h-9 w-full text-[10px] uppercase tracking-wide"
        disabled={saving}
        onClick={() => {
          try {
            assertJnttblValidForSave(data);
          } catch (e) {
            toast.error(String(e));
            return;
          }
          setSaving(true);
          void jnttblWriteFile({
            filePath: selected.path,
            version: data.version,
            boneCount: resolveJnttblBoneCountForSave(data),
            flag: data.flag,
            entries: data.entries,
          })
            .then(() => jnttblReadFile(selected.path))
            .then((result) => {
              setData(readResultToEditorDocument(result));
              toast.success("Saved `.jnttbl`");
            })
            .catch((error) => toast.error(String(error)))
            .finally(() => setSaving(false));
        }}
      >
        <Save className="mr-1 h-3.5 w-3.5" />
        {saving ? "Saving…" : "Save JNTT"}
      </Button>
    </div>
  );
}
