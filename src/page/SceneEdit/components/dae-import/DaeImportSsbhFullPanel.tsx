import { useEffect, useMemo, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDaeSsbhSessionStore } from "@/page/TestEditor/components/ssbh-model-preview/store/daeSsbhSessionStore";
import type { SsbhDaeAnalysisReport } from "@/page/TestEditor/components/ssbh-model-preview/ssbhDaeIoService";
import { NumdlbMaterialMappingEditor } from "@/page/TestEditor/components/ssbh-model-preview/components/NumdlbMaterialMappingEditor";
import { NumatbTemplateEditor } from "@/page/TestEditor/components/ssbh-model-preview/components/NumatbTemplateEditor";
import { MissingTexturePathFillPanel } from "@/page/TestEditor/components/ssbh-model-preview/components/MissingTexturePathFillPanel";
import {
  collectMissingTexturePathSlotRefsForExportSession,
} from "@/page/TestEditor/components/ssbh-model-preview/store/numatbTemplateStoreHelpers";
import type { DaeAnalysisResult } from "./daeImportTypes";
import { DaeImportPanelSection } from "./daeImportUi";

interface DaeImportSsbhFullPanelProps {
  analysis: DaeAnalysisResult | null;
  sourcePath: string;
  stageRoot: string | null;
}

export function DaeImportSsbhFullPanel({ analysis, sourcePath, stageRoot }: DaeImportSsbhFullPanelProps) {
  const setSourcePath = useDaeSsbhSessionStore((state) => state.setSourcePath);
  const loadAnalysis = useDaeSsbhSessionStore((state) => state.loadAnalysis);
  const loadTemplateLibrary = useDaeSsbhSessionStore((state) => state.loadTemplateLibrary);
  const session = useDaeSsbhSessionStore();

  const loadedAnalysisKeyRef = useRef<string | null>(null);

  useEffect(() => {
    void loadTemplateLibrary();
  }, [loadTemplateLibrary]);

  useEffect(() => {
    if (!analysis?.canConvert) {
      loadedAnalysisKeyRef.current = null;
      return;
    }

    const analysisKey = `${sourcePath}\0${analysis.geometryNames.join("\u0001")}`;
    if (loadedAnalysisKeyRef.current === analysisKey) {
      return;
    }

    loadedAnalysisKeyRef.current = analysisKey;
    setSourcePath(sourcePath);
    loadAnalysis(analysis as unknown as SsbhDaeAnalysisReport, { resetMaterialProfiles: true });
  }, [analysis, sourcePath, loadAnalysis, setSourcePath]);

  const selectedGeometrySet = useMemo(() => new Set(session.includeGeometryNames), [session.includeGeometryNames]);

  const updateProfileAttribute = useDaeSsbhSessionStore((state) => state.updateProfileAttribute);

  const missingTextureSlots = useMemo(
    () =>
      collectMissingTexturePathSlotRefsForExportSession(session.mayaFile, session.nustFile, {
        writeNumatb: session.writeNumatb,
        writeMayaProfile: session.writeMayaProfile,
        materialLabels: session.numdlbEntries.map((r) => r.materialLabel),
      }),
    [session.mayaFile, session.nustFile, session.writeNumatb, session.writeMayaProfile, session.numdlbEntries],
  );

  if (!analysis || !analysis.canConvert) {
    return (
      <div className="p-4 text-[11px] text-muted-foreground">
        Waiting for DAE analysis or analysis reported blocking errors.
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      <DaeImportPanelSection title="Output">
        <p className="text-[11px] text-muted-foreground">
          SSBH files are kept in memory until you save the stage folder
          {stageRoot ? ` (${stageRoot})` : ""}.
        </p>
        <div className="grid gap-2 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <Label className="text-[11px] text-muted-foreground">Model folder name</Label>
            <Input
              value={session.outputBaseName}
              onChange={(e) => session.setOutputBaseName(e.target.value)}
              className="h-8 text-[11px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Scale</Label>
              <Input
                value={session.scaleFactorText}
                onChange={(e) => session.setScaleFactorText(e.target.value)}
                className="h-8 text-[11px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Up axis</Label>
              <select
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-[11px]"
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
      </DaeImportPanelSection>

      <DaeImportPanelSection
        title={`Include Geometries (${session.includeGeometryNames.length}/${analysis.geometryNames.length})`}
      >
        <ScrollArea className="max-h-[120px]">
          <div className="space-y-1">
            {analysis.geometryNames.map((name) => (
              <label key={name} className="flex cursor-pointer items-center gap-2 text-[11px]">
                <Checkbox
                  checked={selectedGeometrySet.has(name)}
                  onCheckedChange={(checked) => session.setGeometryEnabled(name, checked === true)}
                />
                <span className="font-mono">{name}</span>
              </label>
            ))}
          </div>
        </ScrollArea>
      </DaeImportPanelSection>

      <DaeImportPanelSection title="Output Files">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <label className="flex cursor-pointer items-center gap-2 text-[11px]">
            <Checkbox checked={session.writeNumdlb} onCheckedChange={(c) => session.setWriteNumdlb(c === true)} />
            .numdlb
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[11px]">
            <Checkbox checked={session.writeNumshb} onCheckedChange={(c) => session.setWriteNumshb(c === true)} />
            .numshb
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[11px]">
            <Checkbox checked={session.writeNusktb} onCheckedChange={(c) => session.setWriteNusktb(c === true)} />
            .nusktb
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[11px]">
            <Checkbox checked={session.writeNumatb} onCheckedChange={(c) => session.setWriteNumatb(c === true)} />
            __nust__.numatb
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[11px]">
            <Checkbox checked={session.writeMayaProfile} onCheckedChange={(c) => session.setWriteMayaProfile(c === true)} />
            __maya__.numatb
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[11px]">
            <Checkbox checked={session.writeLog} onCheckedChange={(c) => session.setWriteLog(c === true)} />
            Write log
          </label>
        </div>
      </DaeImportPanelSection>

      <DaeImportPanelSection title="NUMDLB Mapping">
        <NumdlbMaterialMappingEditor
          rows={session.numdlbEntries}
          onChangeMaterialLabel={session.setMaterialLabel}
          onReplaceAll={session.replaceAllMaterialLabels}
          embedTableWithoutInnerScroll
        />
      </DaeImportPanelSection>

      <DaeImportPanelSection title="NUMATB Profiles (Texture Data)">
        <NumatbTemplateEditor />
      </DaeImportPanelSection>

      <MissingTexturePathFillPanel
        slots={missingTextureSlots}
        onFillSlot={(slot, basename) => {
          const data =
            slot.textureDataKind === "String1" ? { String1: basename } : { String: basename };
          updateProfileAttribute(slot.profile, slot.materialIndex, slot.attributeIndex, data);
        }}
      />
    </div>
  );
}
