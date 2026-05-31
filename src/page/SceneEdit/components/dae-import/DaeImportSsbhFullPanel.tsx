import { useCallback, useEffect, useMemo, useRef } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDaeSsbhSessionStore } from "@/components/ssbh-model-preview/store/daeSsbhSessionStore";
import type { SsbhDaeAnalysisReport } from "@/components/ssbh-model-preview/ssbhDaeIoService";
import { NumdlbMaterialMappingEditor } from "@/components/ssbh-model-preview/components/NumdlbMaterialMappingEditor";
import { NumatbTemplateEditor } from "@/components/ssbh-model-preview/components/NumatbTemplateEditor";
import { MissingTexturePathFillPanel } from "@/components/ssbh-model-preview/components/MissingTexturePathFillPanel";
import {
  buildNumatbClipboardExportPayload,
  copyNumatbProfilesJsonToClipboard,
} from "@/components/ssbh-model-preview/copyNumatbProfilesJson";
import { useStableMissingTextureFillSlots } from "@/components/ssbh-model-preview/hooks/useStableMissingTextureFillSlots";
import {
  applyTexturePathFillToProfiles,
  collectMissingTexturePathSlotRefsForExportSession,
} from "@/components/ssbh-model-preview/store/numatbTemplateStoreHelpers";
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
  const addProfileAttribute = useDaeSsbhSessionStore((state) => state.addProfileAttribute);

  const liveMissingTextureSlots = useMemo(
    () =>
      collectMissingTexturePathSlotRefsForExportSession(session.mayaFile, session.nustFile, {
        writeNumatb: session.writeNumatb,
        writeMayaProfile: session.writeMayaProfile,
      }),
    [session.mayaFile, session.nustFile, session.writeNumatb, session.writeMayaProfile],
  );

  const fillTextureResetKey = useMemo(
    () => `${sourcePath}\0${analysis?.geometryNames?.join("\u0001") ?? ""}`,
    [sourcePath, analysis],
  );

  const fillTextureSlots = useStableMissingTextureFillSlots(
    fillTextureResetKey,
    session.mayaFile,
    session.nustFile,
    liveMissingTextureSlots,
  );

  const handleCopyNumatbProfilesJson = useCallback(async () => {
    await copyNumatbProfilesJsonToClipboard(
      buildNumatbClipboardExportPayload({
        mirrorTexturePathsAcrossProfiles: session.mirrorTexturePathsAcrossProfiles,
        mayaProfile: session.mayaFile,
        nustProfile: session.nustFile,
        numdlbMaterialMappings: session.numdlbEntries,
        exportOptions: {
          writeMayaProfile: session.writeMayaProfile,
          writeNumatb: session.writeNumatb,
        },
      }),
    );
  }, [
    session.mayaFile,
    session.mirrorTexturePathsAcrossProfiles,
    session.nustFile,
    session.numdlbEntries,
    session.writeMayaProfile,
    session.writeNumatb,
  ]);

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
          <label className="md:col-span-2 flex cursor-pointer items-start gap-2 rounded-md border border-dashed px-3 py-2 text-[11px]">
            <Checkbox
              checked={session.flipUv}
              onCheckedChange={(checked) => session.setFlipUv(checked === true)}
            />
            <span className="space-y-0.5">
              <span className="block font-medium text-foreground">Flip UV (V)</span>
              <span className="block text-[10px] text-muted-foreground">
                Invert the V coordinate during SSBH conversion.
              </span>
            </span>
          </label>
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

      <DaeImportPanelSection
        title="NUMATB Profiles (Texture Data)"
        headerEnd={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            title="Copy full NUMATB profile data as JSON (for AI analysis)"
            aria-label="Copy NUMATB profiles as JSON"
            onClick={() => void handleCopyNumatbProfilesJson()}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        }
      >
        <NumatbTemplateEditor />
      </DaeImportPanelSection>

      <MissingTexturePathFillPanel
        slots={fillTextureSlots}
        onFillSlot={(slot, basename) => {
          applyTexturePathFillToProfiles(
            updateProfileAttribute,
            addProfileAttribute,
            () => {
              const state = useDaeSsbhSessionStore.getState();
              return { mayaFile: state.mayaFile, nustFile: state.nustFile };
            },
            slot,
            basename,
          );
        }}
      />
    </div>
  );
}
