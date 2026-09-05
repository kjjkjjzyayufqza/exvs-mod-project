import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { open } from "@tauri-apps/plugin-dialog";
import { FileSearch } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useDaeSsbhSessionStore } from "../store/daeSsbhSessionStore";
import { DialogLastPathKey, getDialogDefaultPath, rememberDialogSelection } from "@/utils/dialogLastPath";
import { ssbhAnalyzeDae, ssbhAnalyzeFbx } from "../ssbhDaeIoService";
import { useSsbhModelPreview } from "../SsbhModelPreviewContext";
import { sanitizeBaseFilename } from "@/page/SceneEdit/components/dae-import/daeImportDefaults";

/** Directory portion of a Windows/POSIX path, or null when the path has no parent segment. */
function parentDirOf(path: string): string | null {
  const normalized = path.replace(/[\\/]+$/, "");
  const lastSep = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  return lastSep > 0 ? normalized.slice(0, lastSep) : null;
}

export function DaeSsbhSourcePicker() {
  const { t } = useTranslation("ssbh-motion");
  const { workspaceRoot } = useSsbhModelPreview();
  const { importKind, sourcePath, setImportKind, setSourcePath, setOutputBaseName, setOutputDir, loadAnalysis } =
    useDaeSsbhSessionStore(
      useShallow((state) => ({
        importKind: state.importKind,
        sourcePath: state.sourcePath,
        setImportKind: state.setImportKind,
        setSourcePath: state.setSourcePath,
        setOutputBaseName: state.setOutputBaseName,
        setOutputDir: state.setOutputDir,
        loadAnalysis: state.loadAnalysis,
      })),
    );
  const [busy, setBusy] = useState(false);

  const importSourceKey =
    importKind === "dae" ? DialogLastPathKey.ssbhDaeImportSourceDae : DialogLastPathKey.ssbhDaeImportSourceFbx;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-[11px] text-muted-foreground">{t("daePicker.importFormat")}</Label>
        <select
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-[11px]"
          value={importKind}
          onChange={(event) => {
            setImportKind(event.target.value as "dae" | "fbx");
            setSourcePath(null);
          }}
        >
          <option value="dae">{t("daePicker.colladaDae")}</option>
          <option value="fbx">{t("daePicker.fbxFbx")}</option>
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
                  title: importKind === "dae" ? t("daePicker.pickColladaTitle") : t("daePicker.pickFbxTitle"),
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
                // Align with the Scene Editor import: derive the output base name from
                // the source file and default the output directory. For an open Unit
                // model workspace, target its per-model folder (`<root>\models\<name>`)
                // so the converted SSBH lands in the current layout instead of the
                // package root; otherwise fall back to the source folder. Filling the
                // output directory also enables NUMATB texture-reference validation,
                // which reads the package's nutexb / textures pool.
                const sourceFileName = nextPath.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? nextPath;
                const baseName = sanitizeBaseFilename(sourceFileName);
                setOutputBaseName(baseName);
                const nextOutputDir = workspaceRoot
                  ? `${workspaceRoot.replace(/[\\/]+$/, "")}\\models\\${baseName}`
                  : parentDirOf(nextPath);
                if (nextOutputDir) {
                  setOutputDir(nextOutputDir);
                }
                setBusy(true);
                void (async () => {
                  try {
                    const analysis =
                      importKind === "dae" ? await ssbhAnalyzeDae(nextPath) : await ssbhAnalyzeFbx(nextPath);
                    loadAnalysis(analysis, { resetMaterialProfiles: true });
                    toast.success(t("daePicker.analyzed", { kind: importKind.toUpperCase() }));
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
            {importKind === "dae" ? t("daePicker.pickDae") : t("daePicker.pickFbx")}
          </Button>
        </div>

        {sourcePath ? (
          <p className="break-all font-mono text-[10px] text-muted-foreground" data-i18n-ignore="">
            {sourcePath}
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">{t("daePicker.pickHint")}</p>
        )}
      </div>
    </div>
  );
}
