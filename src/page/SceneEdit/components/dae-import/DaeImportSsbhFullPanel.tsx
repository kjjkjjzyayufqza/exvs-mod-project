import { useEffect, useMemo } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDaeSsbhSessionStore } from "@/page/TestEditor/components/ssbh-model-preview/store/daeSsbhSessionStore";
import type { SsbhDaeAnalysisReport } from "@/page/TestEditor/components/ssbh-model-preview/ssbhDaeIoService";
import { NumdlbMaterialMappingEditor } from "@/page/TestEditor/components/ssbh-model-preview/components/NumdlbMaterialMappingEditor";
import { NumatbTemplateEditor } from "@/page/TestEditor/components/ssbh-model-preview/components/NumatbTemplateEditor";
import { collectMissingTexturePathsForExportSession } from "@/page/TestEditor/components/ssbh-model-preview/store/numatbTemplateStoreHelpers";
import type { DaeAnalysisResult } from "./daeImportTypes";
import {
  UnrealCheckbox,
  unrealFieldLabelClass,
  unrealMutedTextClass,
  unrealSectionBoxClass,
  unrealSectionTitleClass,
} from "./daeImportUnrealUi";

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
      <div className={cn("p-3 text-[11px]", unrealMutedTextClass)}>
        Waiting for DAE analysis or analysis reported blocking errors.
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3">
      {/* Output directory + base filename */}
      <div className={unrealSectionBoxClass}>
        <p className={unrealSectionTitleClass}>Output</p>
        <div className="grid gap-2 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <Label className={unrealFieldLabelClass}>Output directory</Label>
            <div className="flex gap-1">
              <Input
                value={session.outputDir ?? ""}
                onChange={(e) => session.setOutputDir(e.target.value)}
                className="h-7 border-[#555] bg-[#282828] text-[11px] text-[#eee]"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 shrink-0 border-[#555] bg-[#333] text-[10px] text-[#e8e8e8] hover:bg-[#404040]"
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
            <Label className={unrealFieldLabelClass}>Base filename</Label>
            <Input
              value={session.outputBaseName}
              onChange={(e) => session.setOutputBaseName(e.target.value)}
              className="h-7 border-[#555] bg-[#282828] text-[11px] text-[#eee]"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className={unrealFieldLabelClass}>Scale</Label>
              <Input
                value={session.scaleFactorText}
                onChange={(e) => session.setScaleFactorText(e.target.value)}
                className="h-7 border-[#555] bg-[#282828] text-[11px] text-[#eee]"
              />
            </div>
            <div className="space-y-1">
              <Label className={unrealFieldLabelClass}>Up axis</Label>
              <select
                className="h-7 w-full rounded-md border border-[#555] bg-[#282828] px-2 text-[11px] text-[#eee]"
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
      <div className={unrealSectionBoxClass}>
        <p className={unrealSectionTitleClass}>
          Include Geometries ({session.includeGeometryNames.length}/{analysis.geometryNames.length})
        </p>
        <ScrollArea className="max-h-[120px]">
          <div className="space-y-1">
            {analysis.geometryNames.map((name) => (
              <label key={name} className="flex cursor-pointer items-center gap-2 text-[10px] text-[#e0e0e0]">
                <UnrealCheckbox
                  checked={selectedGeometrySet.has(name)}
                  onCheckedChange={(checked) => session.setGeometryEnabled(name, checked === true)}
                />
                <span className="font-mono">{name}</span>
              </label>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Output files */}
      <div className={unrealSectionBoxClass}>
        <p className={unrealSectionTitleClass}>Output Files</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <label className="flex cursor-pointer items-center gap-2 text-[10px] text-[#e0e0e0]">
            <UnrealCheckbox checked={session.writeNumdlb} onCheckedChange={(c) => session.setWriteNumdlb(c === true)} />
            .numdlb
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[10px] text-[#e0e0e0]">
            <UnrealCheckbox checked={session.writeNumshb} onCheckedChange={(c) => session.setWriteNumshb(c === true)} />
            .numshb
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[10px] text-[#e0e0e0]">
            <UnrealCheckbox checked={session.writeNusktb} onCheckedChange={(c) => session.setWriteNusktb(c === true)} />
            .nusktb
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[10px] text-[#e0e0e0]">
            <UnrealCheckbox checked={session.writeNumatb} onCheckedChange={(c) => session.setWriteNumatb(c === true)} />
            __nust__.numatb
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[10px] text-[#e0e0e0]">
            <UnrealCheckbox checked={session.writeMayaProfile} onCheckedChange={(c) => session.setWriteMayaProfile(c === true)} />
            __maya__.numatb
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[10px] text-[#e0e0e0]">
            <UnrealCheckbox checked={session.writeLog} onCheckedChange={(c) => session.setWriteLog(c === true)} />
            Write log
          </label>
        </div>
      </div>

      {/* NUMDLB Mapping */}
      <div className={unrealSectionBoxClass}>
        <p className={unrealSectionTitleClass}>NUMDLB Mapping</p>
        <NumdlbMaterialMappingEditor
          rows={session.numdlbEntries}
          onChangeMaterialLabel={session.setMaterialLabel}
          onReplaceAll={session.replaceAllMaterialLabels}
          embedTableWithoutInnerScroll
          themeVariant="embedded"
        />
      </div>

      {/* NUMATB Profiles (texture data editor) */}
      <div className={unrealSectionBoxClass}>
        <p className={unrealSectionTitleClass}>NUMATB Profiles (Texture Data)</p>
        <NumatbTemplateEditor themeVariant="embedded" />
      </div>

      {/* Validation messages */}
      {missingTexturePaths.length > 0 && (
        <div className="rounded border border-red-700/40 bg-red-950/20 p-2">
          <p className="text-[10px] text-red-400">
            Fill every texture path parameter for profiles you export:
          </p>
          <ul className={cn("mt-1 max-h-24 list-inside list-disc overflow-y-auto font-mono text-[9px]", unrealMutedTextClass)}>
            {missingTexturePaths.slice(0, 12).map((line, i) => (
              <li key={i} className="break-all">{line}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
