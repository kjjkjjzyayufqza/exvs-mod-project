import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { open } from "@tauri-apps/plugin-dialog";
import { FileSearch } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useDaeSsbhSessionStore } from "../store/daeSsbhSessionStore";
import { DialogLastPathKey, getDialogDefaultPath, rememberDialogSelection } from "@/utils/dialogLastPath";
import { ssbhAnalyzeDae, ssbhAnalyzeFbx } from "../ssbhDaeIoService";
import { useSsbhModelPreview } from "../SsbhModelPreviewContext";

export function DaeSsbhSourcePicker() {
  const { workspaceRoot } = useSsbhModelPreview();
  const { importKind, sourcePath, setImportKind, setSourcePath, loadAnalysis } = useDaeSsbhSessionStore(
    useShallow((state) => ({
      importKind: state.importKind,
      sourcePath: state.sourcePath,
      setImportKind: state.setImportKind,
      setSourcePath: state.setSourcePath,
      loadAnalysis: state.loadAnalysis,
    })),
  );
  const [busy, setBusy] = useState(false);

  const importSourceKey =
    importKind === "dae" ? DialogLastPathKey.ssbhDaeImportSourceDae : DialogLastPathKey.ssbhDaeImportSourceFbx;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-[11px] text-muted-foreground">Import format</Label>
        <select
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-[11px]"
          value={importKind}
          onChange={(event) => {
            setImportKind(event.target.value as "dae" | "fbx");
            setSourcePath(null);
          }}
        >
          <option value="dae">COLLADA (.dae)</option>
          <option value="fbx">FBX (.fbx)</option>
        </select>
      </div>

      <div className="space-y-2 rounded-md border p-3">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-[10px] uppercase tracking-wide"
            disabled={busy}
            onClick={() => {
              void (async () => {
                const selected = await open({
                  title: importKind === "dae" ? "Pick COLLADA source" : "Pick FBX source",
                  multiple: false,
                  filters:
                    importKind === "dae"
                      ? [{ name: "COLLADA", extensions: ["dae"] }]
                      : [{ name: "FBX", extensions: ["fbx"] }],
                  defaultPath: getDialogDefaultPath(importSourceKey, workspaceRoot),
                });
                if (typeof selected !== "string" || !selected.trim()) {
                  return;
                }
                rememberDialogSelection(importSourceKey, selected.trim(), "file");
                const nextPath = selected.trim();
                setSourcePath(nextPath);
                setBusy(true);
                void (async () => {
                  try {
                    const analysis =
                      importKind === "dae" ? await ssbhAnalyzeDae(nextPath) : await ssbhAnalyzeFbx(nextPath);
                    loadAnalysis(analysis);
                    toast.success(`Analyzed ${importKind.toUpperCase()} source`);
                  } catch (error) {
                    toast.error(String(error));
                  } finally {
                    setBusy(false);
                  }
                })();
              })();
            }}
          >
            <FileSearch className="mr-1 h-3.5 w-3.5" />
            Pick {importKind === "dae" ? ".dae" : ".fbx"}
          </Button>
        </div>

        {sourcePath ? (
          <p className="break-all font-mono text-[10px] text-muted-foreground">{sourcePath}</p>
        ) : (
          <p className="text-[11px] text-muted-foreground">Pick a source file; analysis runs automatically after selection.</p>
        )}
      </div>
    </div>
  );
}
