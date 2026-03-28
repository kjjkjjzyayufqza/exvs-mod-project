import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDaeSsbhSessionStore } from "../store/daeSsbhSessionStore";
import { DialogLastPathKey, getDialogDefaultPath, rememberDialogSelection } from "@/utils/dialogLastPath";
import { useSsbhModelPreview } from "../SsbhModelPreviewContext";
import { ssbhAnalyzeDae, ssbhAnalyzeFbx, ssbhConvertDaeToSsbh, ssbhConvertFbxToSsbh } from "../ssbhDaeIoService";
import { collectMissingTexturePathsForExportSession } from "../store/numatbTemplateStoreHelpers";
import { NumdlbMaterialMappingEditor } from "./NumdlbMaterialMappingEditor";
import { NumatbTemplateEditor } from "./NumatbTemplateEditor";

export function DaeSsbhSessionLayout() {
  const preview = useSsbhModelPreview();
  const session = useDaeSsbhSessionStore();
  const loadTemplateLibrary = useDaeSsbhSessionStore((state) => state.loadTemplateLibrary);
  const [busy, setBusy] = useState<"analyze" | "convert" | null>(null);

  useEffect(() => {
    void loadTemplateLibrary();
  }, [loadTemplateLibrary]);

  const selectedGeometrySet = useMemo(() => new Set(session.includeGeometryNames), [session.includeGeometryNames]);

  const missingTexturePaths = useMemo(
    () =>
      collectMissingTexturePathsForExportSession(session.mayaFile, session.nustFile, {
        writeNumatb: session.writeNumatb,
        writeMayaProfile: session.writeMayaProfile,
      }),
    [session.mayaFile, session.nustFile, session.writeNumatb, session.writeMayaProfile],
  );

  const baseExportReady =
    !!session.sourcePath &&
    !!session.analysis &&
    session.analysis.canConvert &&
    !!session.outputBaseName.trim() &&
    !!session.outputDir?.trim() &&
    session.includeGeometryNames.length > 0 &&
    session.numdlbEntries.every((row) => row.materialLabel.trim()) &&
    (!session.writeNumdlb || (session.writeNumshb && session.writeNusktb));

  const canExport = baseExportReady && missingTexturePaths.length === 0;

  const reAnalyze = async () => {
    if (!session.sourcePath) return;
    setBusy("analyze");
    try {
      const analysis =
        session.importKind === "dae"
          ? await ssbhAnalyzeDae(session.sourcePath)
          : await ssbhAnalyzeFbx(session.sourcePath);
      session.loadAnalysis(analysis);
      toast.success("Analysis refreshed");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(null);
    }
  };

  const convert = async () => {
    if (!session.sourcePath || !session.outputDir) return;
    if (missingTexturePaths.length > 0) {
      throw new Error(
        `Texture path validation failed. Fill every texture path slot (e.g. *Map, Texture1, *CubeMap) for profiles you export:\n${missingTexturePaths.join("\n")}`,
      );
    }
    setBusy("convert");
    try {
      const params = {
        outputDir: session.outputDir,
        baseFilename: session.outputBaseName.trim(),
        scaleFactor: Number(session.scaleFactorText),
        flipUv: session.flipUv,
        upAxis: session.upAxis,
        includeGeometryNames: session.includeGeometryNames,
        writeLog: session.writeLog,
        writeNumdlb: session.writeNumdlb,
        writeNumshb: session.writeNumshb,
        writeNusktb: session.writeNusktb,
        writeNumatb: session.writeNumatb,
        writeMayaProfile: session.writeMayaProfile,
        numdlbEntries: session.numdlbEntries,
        mayaFile: session.writeNumatb ? session.mayaFile : null,
        nustFile: session.writeNumatb ? session.nustFile : null,
      };
      const result =
        session.importKind === "dae"
          ? await ssbhConvertDaeToSsbh({ daePath: session.sourcePath, ...params })
          : await ssbhConvertFbxToSsbh({ fbxPath: session.sourcePath, ...params });
      session.setLastResult(result);
      const nustMatPath = result.files.nustNumatbPath ?? result.files.numatbPath;
      const lines = [
        result.files.numdlbPath ? `numdlb: ${result.files.numdlbPath}` : null,
        result.files.numshbPath ? `numshb: ${result.files.numshbPath}` : null,
        result.files.nusktbPath ? `nusktb: ${result.files.nusktbPath}` : null,
        nustMatPath ? `__nust__.numatb: ${nustMatPath}` : null,
        result.files.mayaNumatbPath ? `__maya__.numatb: ${result.files.mayaNumatbPath}` : null,
      ].filter(Boolean);
      toast.success("Converted to SSBH", { description: lines.join("\n") });
      if (result.files.numdlbPath) {
        await preview.loadModelAt(result.files.numdlbPath);
      }
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(null);
    }
  };

  if (!session.analysis) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3">
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Source Summary</p>
          <p className="font-mono text-[11px]">{session.sourcePath}</p>
          <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
            <span>Geometries: {session.analysis.geometryNames.length}</span>
            <span>Bones: {session.analysis.boneCount}</span>
            <span>Up axis: {session.analysis.upAxis}</span>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" className="h-8 text-[10px] uppercase tracking-wide" disabled={busy !== null} onClick={() => void reAnalyze()}>
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${busy === "analyze" ? "animate-spin" : ""}`} />
          Re-analyze
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-3 rounded-md border p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Output Naming</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1 md:col-span-2">
              <Label className="text-[11px] text-muted-foreground">Base filename</Label>
              <Input value={session.outputBaseName} onChange={(event) => session.setOutputBaseName(event.target.value)} className="h-8 text-[11px]" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Scale</Label>
              <Input value={session.scaleFactorText} onChange={(event) => session.setScaleFactorText(event.target.value)} className="h-8 text-[11px]" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Up axis</Label>
              <select
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-[11px]"
                value={session.upAxis}
                onChange={(event) => session.setUpAxis(event.target.value as "y_up" | "z_up" | "none")}
              >
                <option value="y_up">Y-up</option>
                <option value="z_up">Z-up</option>
                <option value="none">None</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[11px] text-muted-foreground">Output directory</Label>
            <div className="flex gap-2">
              <Input value={session.outputDir ?? ""} onChange={(event) => session.setOutputDir(event.target.value)} className="h-8 text-[11px]" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-[10px] uppercase tracking-wide"
                onClick={() => {
                  void (async () => {
                    const selected = await open({
                      directory: true,
                      multiple: false,
                      title: "Pick output directory",
                      defaultPath: getDialogDefaultPath(DialogLastPathKey.ssbhDaeConvertOutputFolder, preview.workspaceRoot),
                    });
                    if (typeof selected !== "string" || !selected.trim()) return;
                    rememberDialogSelection(DialogLastPathKey.ssbhDaeConvertOutputFolder, selected.trim(), "directory");
                    session.setOutputDir(selected.trim());
                  })();
                }}
              >
                <FolderOpen className="mr-1 h-3.5 w-3.5" />
                Browse
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[11px] text-muted-foreground">Include geometries</Label>
            <ScrollArea className="h-[180px] rounded-md border">
              <div className="space-y-1 p-3">
                {session.analysis.geometryNames.map((geometryName) => (
                  <label key={geometryName} className="flex items-center gap-2 text-[11px]">
                    <Checkbox
                      checked={selectedGeometrySet.has(geometryName)}
                      onCheckedChange={(checked) => session.setGeometryEnabled(geometryName, checked === true)}
                    />
                    <span className="font-mono">{geometryName}</span>
                  </label>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>

        <div className="space-y-3 rounded-md border p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Output Files</p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-[11px]">
              <Checkbox checked={session.writeNumdlb} onCheckedChange={(checked) => session.setWriteNumdlb(checked === true)} />
              <span>.numdlb</span>
            </label>
            <label className="flex items-center gap-2 text-[11px]">
              <Checkbox checked={session.writeNumshb} onCheckedChange={(checked) => session.setWriteNumshb(checked === true)} />
              <span>.numshb</span>
            </label>
            <label className="flex items-center gap-2 text-[11px]">
              <Checkbox checked={session.writeNusktb} onCheckedChange={(checked) => session.setWriteNusktb(checked === true)} />
              <span>.nusktb</span>
            </label>
            <label className="flex items-center gap-2 text-[11px]">
              <Checkbox checked={session.writeNumatb} onCheckedChange={(checked) => session.setWriteNumatb(checked === true)} />
              <span>__nust__.numatb (Nust profile; referenced by .numdlb)</span>
            </label>
            <label className="flex items-center gap-2 text-[11px]">
              <Checkbox checked={session.writeMayaProfile} onCheckedChange={(checked) => session.setWriteMayaProfile(checked === true)} />
              <span>__maya__.numatb (optional extra)</span>
            </label>
            <label className="flex items-center gap-2 text-[11px]">
              <Checkbox checked={session.writeLog} onCheckedChange={(checked) => session.setWriteLog(checked === true)} />
              <span>Write log</span>
            </label>
          </div>

        </div>
      </div>

      <div className="space-y-3 rounded-md border p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">NUMDLB Mapping</p>
        <NumdlbMaterialMappingEditor
          rows={session.numdlbEntries}
          onChangeMaterialLabel={session.setMaterialLabel}
          onReplaceAll={session.replaceAllMaterialLabels}
        />
      </div>

      <div className="space-y-3 rounded-md border p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">NUMATB Profiles</p>
        <NumatbTemplateEditor />
      </div>

      <div className="space-y-3 rounded-md border p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Confirm Export</p>
        <Button type="button" className="h-9 w-full text-[10px] uppercase tracking-wide" disabled={!canExport || busy !== null} onClick={() => void convert()}>
          <Save className="mr-1 h-3.5 w-3.5" />
          {busy === "convert" ? "Converting..." : "Convert to SSBH"}
        </Button>
        {!baseExportReady ? (
          <p className="text-[11px] text-muted-foreground">
            Output directory, base filename, geometry selection, and non-empty material labels are required.
          </p>
        ) : missingTexturePaths.length > 0 ? (
          <div className="space-y-2">
            <p className="text-[11px] text-destructive">
              {
                "Every texture path parameter must be filled for the Maya/Nust profiles you are exporting (parameters such as Texture1, RoughnessMap, AmbientOcclusionMap, BaseColorMap, DiffuseCubeMap, etc.)."
              }
            </p>
            <ul className="max-h-36 list-inside list-disc overflow-y-auto rounded-md border border-destructive/30 bg-destructive/5 p-2 font-mono text-[10px] text-muted-foreground">
              {missingTexturePaths.slice(0, 24).map((line, index) => (
                <li key={`${index}:${line}`} className="break-all">
                  {line}
                </li>
              ))}
            </ul>
            {missingTexturePaths.length > 24 ? (
              <p className="text-[10px] text-muted-foreground">{"…and more (fix listed items first)."}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
