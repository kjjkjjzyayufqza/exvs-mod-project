import { useEffect, useMemo } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDaeSsbhSessionStore } from "@/page/TestEditor/components/ssbh-model-preview/store/daeSsbhSessionStore";
import type { SsbhDaeAnalysisReport } from "@/page/TestEditor/components/ssbh-model-preview/ssbhDaeIoService";
import { NumdlbMaterialMappingEditor } from "@/page/TestEditor/components/ssbh-model-preview/components/NumdlbMaterialMappingEditor";
import { NumatbTemplateEditor } from "@/page/TestEditor/components/ssbh-model-preview/components/NumatbTemplateEditor";
import { collectMissingTexturePathsForExportSession } from "@/page/TestEditor/components/ssbh-model-preview/store/numatbTemplateStoreHelpers";
import type { DaeAnalysisResult } from "./daeImportTypes";

interface DaeImportSsbhFullPanelProps {
  analysis: DaeAnalysisResult | null;
  sourcePath: string;
}

export function DaeImportSsbhFullPanel({ analysis, sourcePath }: DaeImportSsbhFullPanelProps) {
  const session = useDaeSsbhSessionStore();
  const loadTemplateLibrary = useDaeSsbhSessionStore((s) => s.loadTemplateLibrary);

  useEffect(() => {
    void loadTemplateLibrary();
  }, [loadTemplateLibrary]);

  // Sync analysis into the session store when it arrives
  useEffect(() => {
    if (analysis && analysis.canConvert) {
      session.setSourcePath(sourcePath);
      session.loadAnalysis(analysis as unknown as SsbhDaeAnalysisReport);
    }
  }, [analysis, sourcePath]);

  const selectedGeometrySet = useMemo(() => new Set(session.includeGeometryNames), [session.includeGeometryNames]);

  const missingTexturePaths = useMemo(
    () =>
      collectMissingTexturePathsForExportSession(session.mayaFile, session.nustFile, {
        writeNumatb: session.writeNumatb,
        writeMayaProfile: session.writeMayaProfile,
        materialLabels: session.numdlbEntries.map((r) => r.materialLabel),
      }),
    [session.mayaFile, session.nustFile, session.writeNumatb, session.writeMayaProfile, session.numdlbEntries],
  );

  if (!analysis || !analysis.canConvert) {
    return (
      <div className="p-3 text-[11px] text-[#888]">
        Waiting for DAE analysis or analysis reported blocking errors.
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3">
      {/* Output directory + base filename */}
      <div className="space-y-2 rounded border border-[#3a3a3a] p-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#888]">Output</p>
        <div className="grid gap-2 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <Label className="text-[10px] text-[#888]">Output directory</Label>
            <div className="flex gap-1">
              <Input
                value={session.outputDir ?? ""}
                onChange={(e) => session.setOutputDir(e.target.value)}
                className="h-7 bg-[#1a1a1a] text-[11px] text-[#ccc]"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 shrink-0 border-[#444] bg-[#2a2a2a] text-[10px] text-[#ccc] hover:bg-[#3a3a3a]"
                onClick={() => {
                  void (async () => {
                    const selected = await open({ directory: true, title: "Pick output directory" });
                    if (typeof selected === "string" && selected.trim()) {
                      session.setOutputDir(selected.trim());
                    }
                  })();
                }}
              >
                <FolderOpen className="mr-1 h-3 w-3" />
                Browse
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-[#888]">Base filename</Label>
            <Input
              value={session.outputBaseName}
              onChange={(e) => session.setOutputBaseName(e.target.value)}
              className="h-7 bg-[#1a1a1a] text-[11px] text-[#ccc]"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-[#888]">Scale</Label>
              <Input
                value={session.scaleFactorText}
                onChange={(e) => session.setScaleFactorText(e.target.value)}
                className="h-7 bg-[#1a1a1a] text-[11px] text-[#ccc]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-[#888]">Up axis</Label>
              <select
                className="h-7 w-full rounded-md border border-[#444] bg-[#1a1a1a] px-2 text-[11px] text-[#ccc]"
                value={session.upAxis}
                onChange={(e) => session.setUpAxis(e.target.value as "y_up" | "z_up" | "none")}
              >
                <option value="y_up">Y-up</option>
                <option value="z_up">Z-up</option>
                <option value="none">None</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Geometry selection */}
      <div className="space-y-2 rounded border border-[#3a3a3a] p-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#888]">
          Include Geometries ({session.includeGeometryNames.length}/{analysis.geometryNames.length})
        </p>
        <ScrollArea className="max-h-[120px]">
          <div className="space-y-1">
            {analysis.geometryNames.map((name) => (
              <label key={name} className="flex items-center gap-2 text-[10px] text-[#ccc]">
                <Checkbox
                  checked={selectedGeometrySet.has(name)}
                  onCheckedChange={(checked) => session.setGeometryEnabled(name, checked === true)}
                  className="h-3.5 w-3.5"
                />
                <span className="font-mono">{name}</span>
              </label>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Output files */}
      <div className="space-y-2 rounded border border-[#3a3a3a] p-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#888]">Output Files</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <label className="flex items-center gap-2 text-[10px] text-[#ccc]">
            <Checkbox checked={session.writeNumdlb} onCheckedChange={(c) => session.setWriteNumdlb(c === true)} className="h-3.5 w-3.5" />
            .numdlb
          </label>
          <label className="flex items-center gap-2 text-[10px] text-[#ccc]">
            <Checkbox checked={session.writeNumshb} onCheckedChange={(c) => session.setWriteNumshb(c === true)} className="h-3.5 w-3.5" />
            .numshb
          </label>
          <label className="flex items-center gap-2 text-[10px] text-[#ccc]">
            <Checkbox checked={session.writeNusktb} onCheckedChange={(c) => session.setWriteNusktb(c === true)} className="h-3.5 w-3.5" />
            .nusktb
          </label>
          <label className="flex items-center gap-2 text-[10px] text-[#ccc]">
            <Checkbox checked={session.writeNumatb} onCheckedChange={(c) => session.setWriteNumatb(c === true)} className="h-3.5 w-3.5" />
            __nust__.numatb
          </label>
          <label className="flex items-center gap-2 text-[10px] text-[#ccc]">
            <Checkbox checked={session.writeMayaProfile} onCheckedChange={(c) => session.setWriteMayaProfile(c === true)} className="h-3.5 w-3.5" />
            __maya__.numatb
          </label>
          <label className="flex items-center gap-2 text-[10px] text-[#ccc]">
            <Checkbox checked={session.writeLog} onCheckedChange={(c) => session.setWriteLog(c === true)} className="h-3.5 w-3.5" />
            Write log
          </label>
        </div>
      </div>

      {/* NUMDLB Mapping */}
      <div className="space-y-2 rounded border border-[#3a3a3a] p-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#888]">NUMDLB Mapping</p>
        <NumdlbMaterialMappingEditor
          rows={session.numdlbEntries}
          onChangeMaterialLabel={session.setMaterialLabel}
          onReplaceAll={session.replaceAllMaterialLabels}
          embedTableWithoutInnerScroll
        />
      </div>

      {/* NUMATB Profiles (texture data editor) */}
      <div className="space-y-2 rounded border border-[#3a3a3a] p-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#888]">NUMATB Profiles (Texture Data)</p>
        <NumatbTemplateEditor />
      </div>

      {/* Validation messages */}
      {missingTexturePaths.length > 0 && (
        <div className="rounded border border-red-700/40 bg-red-950/20 p-2">
          <p className="text-[10px] text-red-400">
            Fill every texture path parameter for profiles you export:
          </p>
          <ul className="mt-1 max-h-24 list-inside list-disc overflow-y-auto font-mono text-[9px] text-[#888]">
            {missingTexturePaths.slice(0, 12).map((line, i) => (
              <li key={i} className="break-all">{line}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
