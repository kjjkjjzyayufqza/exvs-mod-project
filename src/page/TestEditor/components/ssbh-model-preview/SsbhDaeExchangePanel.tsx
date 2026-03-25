import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, FileDown, FileInput } from "lucide-react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useSsbhModelPreview } from "./SsbhModelPreviewContext";
import {
  loadDaeExchangePresets,
  saveDaeExchangePresets,
  ssbhAnalyzeDae,
  ssbhConvertDaeToSsbh,
  ssbhExportFolderToDae,
  type SsbhDaeAnalysisReport,
  type SsbhDaeExchangePreset,
  type SsbhDaeUpAxis,
} from "./ssbhDaeIoService";

const daeSelectClass =
  "h-8 w-full rounded-md border border-input bg-background px-2 text-[11px] shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";

function DaeToolSection({
  title,
  icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [openSec, setOpenSec] = useState(defaultOpen);
  return (
    <div className="flex flex-col rounded-md border border-border/60">
      <button
        type="button"
        onClick={() => setOpenSec(!openSec)}
        className="flex w-full items-center gap-2 bg-muted/25 px-2 py-2 transition-colors hover:bg-muted/45"
      >
        {openSec ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-[10px] font-bold uppercase tracking-wider">{title}</span>
        </div>
      </button>
      {openSec ? <div className="border-t border-border/50 p-3">{children}</div> : null}
    </div>
  );
}

function isSsbhDaeUpAxis(v: unknown): v is SsbhDaeUpAxis {
  return v === "y_up" || v === "z_up" || v === "none";
}

function assertValidPreset(pr: SsbhDaeExchangePreset): void {
  if (typeof pr.exportScale !== "string" || !pr.exportScale.trim()) {
    throw new Error(`Preset "${pr.name}" has invalid exportScale`);
  }
  if (!isSsbhDaeUpAxis(pr.exportUp)) {
    throw new Error(`Preset "${pr.name}" has invalid exportUp`);
  }
  if (typeof pr.importScale !== "string" || !pr.importScale.trim()) {
    throw new Error(`Preset "${pr.name}" has invalid importScale`);
  }
  if (!isSsbhDaeUpAxis(pr.importUp)) {
    throw new Error(`Preset "${pr.name}" has invalid importUp`);
  }
  if (typeof pr.importFlipV !== "boolean") {
    throw new Error(`Preset "${pr.name}" has invalid importFlipV`);
  }
  if (typeof pr.writeLog !== "boolean") {
    throw new Error(`Preset "${pr.name}" has invalid writeLog`);
  }
}

export function SsbhDaeExchangePanel() {
  const p = useSsbhModelPreview();

  const [exportScale, setExportScale] = useState("1");
  const [exportUp, setExportUp] = useState<SsbhDaeUpAxis>("y_up");
  const [exportSubset, setExportSubset] = useState(false);
  const [exportKeys, setExportKeys] = useState<ReadonlySet<string>>(new Set());

  const [daePath, setDaePath] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<SsbhDaeAnalysisReport | null>(null);
  const [importGeomPick, setImportGeomPick] = useState<ReadonlySet<string>>(new Set());
  const [importBase, setImportBase] = useState("model");
  const [importScale, setImportScale] = useState("1");
  const [importUp, setImportUp] = useState<SsbhDaeUpAxis>("y_up");
  const [importFlipV, setImportFlipV] = useState(false);
  const [writeLog, setWriteLog] = useState(false);
  const [writeNumdlb, setWriteNumdlb] = useState(true);
  const [writeNumshb, setWriteNumshb] = useState(true);
  const [writeNusktb, setWriteNusktb] = useState(true);
  const [outputFilesOpen, setOutputFilesOpen] = useState(false);

  const [lastExportDae, setLastExportDae] = useState<string | null>(null);
  const [lastOutputDir, setLastOutputDir] = useState<string | null>(null);
  const [lastLogPath, setLastLogPath] = useState<string | null>(null);

  const [presets, setPresets] = useState<SsbhDaeExchangePreset[]>(() => loadDaeExchangePresets());
  const [presetPick, setPresetPick] = useState<string>("");
  const [presetSaveName, setPresetSaveName] = useState("");

  const [busy, setBusy] = useState<"analyze" | "export" | "import" | null>(null);

  useEffect(() => {
    if (!p.draws.length) {
      setExportKeys(new Set());
      return;
    }
    setExportKeys((prev) => {
      const next = new Set<string>();
      for (const d of p.draws) {
        if (prev.size === 0 || prev.has(d.key)) next.add(d.key);
      }
      if (next.size === 0) {
        for (const d of p.draws) next.add(d.key);
      }
      return next;
    });
  }, [p.draws]);

  const applyPreset = useCallback((pr: SsbhDaeExchangePreset) => {
    assertValidPreset(pr);
    setExportScale(pr.exportScale);
    setExportUp(pr.exportUp);
    setImportScale(pr.importScale);
    setImportUp(pr.importUp);
    setImportFlipV(pr.importFlipV);
    setWriteLog(pr.writeLog);
  }, []);

  const saveCurrentPreset = useCallback(() => {
    const name = presetSaveName.trim();
    if (!name) {
      toast.error("Enter a preset name.");
      return;
    }
    const next: SsbhDaeExchangePreset = {
      name,
      exportScale: exportScale.trim(),
      exportUp,
      importScale: importScale.trim(),
      importUp,
      importFlipV,
      writeLog,
    };
    const filtered = presets.filter((x) => x.name !== name);
    const merged = [...filtered, next].sort((a, b) => a.name.localeCompare(b.name));
    setPresets(merged);
    saveDaeExchangePresets(merged);
    setPresetPick(name);
    toast.success(`Saved preset "${name}"`);
  }, [presetSaveName, exportScale, exportUp, importScale, importUp, importFlipV, writeLog, presets]);

  const selectedPreset = useMemo(
    () => presets.find((x) => x.name === presetPick) ?? null,
    [presets, presetPick],
  );

  const toggleExportKey = (key: string, on: boolean) => {
    setExportKeys((prev) => {
      const n = new Set(prev);
      if (on) n.add(key);
      else n.delete(key);
      return n;
    });
  };

  const geometryFilterForInvoke = useMemo(() => {
    const names = analysis?.geometryNames;
    if (!names?.length) return [];
    const all = new Set(names);
    if (importGeomPick.size === all.size && [...importGeomPick].every((g) => all.has(g))) {
      return [];
    }
    return [...importGeomPick];
  }, [analysis, importGeomPick]);

  const onToggleNumdlb = (on: boolean) => {
    setWriteNumdlb(on);
    if (on) {
      setWriteNumshb(true);
      setWriteNusktb(true);
    }
  };

  return (
    <div className="flex flex-col gap-3 text-[11px]">
      <div className="flex flex-col gap-2">
        <Label className="text-[10px] text-muted-foreground">Parameter presets (localStorage)</Label>
        <div className="flex flex-wrap gap-2">
          <select
            className={`${daeSelectClass} min-w-[140px]`}
            value={presetPick}
            onChange={(e) => {
              const v = e.target.value;
              setPresetPick(v);
              const pr = presets.find((x) => x.name === v);
              if (!pr) return;
              try {
                applyPreset(pr);
              } catch (err) {
                toast.error(String(err));
              }
            }}
          >
            <option value="">—</option>
            {presets.map((pr) => (
              <option key={pr.name} value={pr.name}>
                {pr.name}
              </option>
            ))}
          </select>
          {selectedPreset ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-[11px]"
              onClick={() => {
                try {
                  applyPreset(selectedPreset);
                } catch (err) {
                  toast.error(String(err));
                }
              }}
            >
              Apply
            </Button>
          ) : null}
          <Input
            placeholder="New preset name"
            value={presetSaveName}
            onChange={(e) => setPresetSaveName(e.target.value)}
            className="h-8 max-w-[160px] text-[11px]"
          />
          <Button type="button" size="sm" variant="secondary" className="h-8 text-[11px]" onClick={saveCurrentPreset}>
            Save preset
          </Button>
        </div>
      </div>

      <Separator />

      <DaeToolSection title="Export to COLLADA (SSBH → .dae)" icon={<FileDown className="h-3.5 w-3.5" />} defaultOpen>
        <div className="flex flex-col gap-3">
          <p className="text-[10px] leading-snug text-muted-foreground">
            Uses the model folder already loaded in Model Preview. Materials are not embedded; edit in a DCC and convert back
            in the section below.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground">Scale</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={exportScale}
                onChange={(e) => setExportScale(e.target.value)}
                className="h-8 text-[11px]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground">Up axis</Label>
              <select className={daeSelectClass} value={exportUp} onChange={(e) => setExportUp(e.target.value as SsbhDaeUpAxis)}>
                <option value="y_up">Y-up</option>
                <option value="z_up">Z-up</option>
                <option value="none">As stored</option>
              </select>
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox checked={exportSubset} onCheckedChange={(c) => setExportSubset(c === true)} className="h-3.5 w-3.5" />
            <span className="text-[10px] text-muted-foreground">Export only selected mesh objects (from Model Preview list)</span>
          </label>
          {exportSubset && p.draws.length > 0 ? (
            <ScrollArea className="max-h-[140px] rounded border border-border/60 p-2">
              <div className="flex flex-col gap-1 pr-3">
                {p.draws.map((d) => (
                  <label key={d.key} className="flex cursor-pointer items-center gap-2">
                    <Checkbox
                      checked={exportKeys.has(d.key)}
                      onCheckedChange={(c) => toggleExportKey(d.key, c === true)}
                      className="h-3.5 w-3.5"
                    />
                    <span className="font-mono text-[10px] leading-tight">
                      {d.meshObjectName} [{d.meshObjectSubindex}]
                    </span>
                  </label>
                ))}
              </div>
            </ScrollArea>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="h-8 text-[11px]"
              disabled={
                !p.bundle?.rootFolder ||
                p.loading ||
                busy !== null ||
                (exportSubset && p.draws.length === 0)
              }
              onClick={() => {
                void (async () => {
                  const root = p.bundle?.rootFolder;
                  if (!root?.trim()) {
                    toast.error("Load a model in Model Preview first (folder or .numdlb).");
                    return;
                  }
                  const scale = Number.parseFloat(exportScale.trim());
                  if (!Number.isFinite(scale) || scale <= 0) {
                    toast.error("Export scale must be a positive number.");
                    return;
                  }
                  if (exportSubset && exportKeys.size === 0) {
                    toast.error("Select at least one mesh object for subset export.");
                    return;
                  }
                  const out = await save({
                    title: "Export COLLADA",
                    filters: [{ name: "COLLADA", extensions: ["dae"] }],
                    defaultPath: p.workspaceRoot ?? undefined,
                  });
                  if (typeof out !== "string" || !out.trim()) return;
                  const include =
                    exportSubset && p.draws.length > 0
                      ? p.draws.filter((d) => exportKeys.has(d.key)).map((d) => ({ name: d.meshObjectName, subindex: d.meshObjectSubindex }))
                      : null;
                  setBusy("export");
                  try {
                    const res = await ssbhExportFolderToDae({
                      rootPath: root,
                      outputDaePath: out.trim(),
                      scaleFactor: scale,
                      upAxis: exportUp,
                      includeMeshObjects: include,
                    });
                    setLastExportDae(res.daePath);
                    toast.success("Exported DAE", {
                      description: `${res.daePath}\nobjects=${res.stats.objectsExported} triangles=${res.stats.trianglesExported}`,
                    });
                  } catch (e) {
                    toast.error(String(e));
                  } finally {
                    setBusy(null);
                  }
                })();
              }}
            >
              {busy === "export" ? "Exporting…" : "Save .dae…"}
            </Button>
            {lastExportDae ? (
              <Button type="button" size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => void openPath(lastExportDae)}>
                Open DAE
              </Button>
            ) : null}
          </div>
        </div>
      </DaeToolSection>

      <DaeToolSection title="Convert to SSBH (DAE → SSBH)" icon={<FileInput className="h-3.5 w-3.5" />} defaultOpen>
        <div className="flex flex-col gap-3">
          <p className="text-[10px] leading-snug text-muted-foreground">
            Writes selected formats into the output folder. .numdlb lists .numshb / .nusktb by base name; you still need a
            matching <span className="font-mono">.numatb</span> for in-game materials.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-[11px]"
              disabled={busy !== null}
              onClick={() => {
                void (async () => {
                  const path = await open({
                    title: "COLLADA source",
                    multiple: false,
                    filters: [{ name: "COLLADA", extensions: ["dae"] }],
                    defaultPath: p.workspaceRoot ?? undefined,
                  });
                  if (typeof path !== "string" || !path.trim()) return;
                  setDaePath(path.trim());
                  setAnalysis(null);
                  setImportGeomPick(new Set());
                })();
              }}
            >
              Pick .dae…
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8 text-[11px]"
              disabled={!daePath || busy !== null}
              onClick={() => {
                void (async () => {
                  if (!daePath) return;
                  setBusy("analyze");
                  try {
                    const rep = await ssbhAnalyzeDae(daePath);
                    setAnalysis(rep);
                    setImportGeomPick(new Set(rep.geometryNames));
                  } catch (e) {
                    toast.error(String(e));
                  } finally {
                    setBusy(null);
                  }
                })();
              }}
            >
              {busy === "analyze" ? "Analyzing…" : "Analyze"}
            </Button>
          </div>
          {daePath ? <p className="break-all font-mono text-[10px] text-muted-foreground">{daePath}</p> : null}

          {analysis ? (
            <div className="rounded border border-border/60 bg-muted/15 p-2">
              <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 border-b border-border/40 pb-2 text-[10px] text-muted-foreground">
                <span>
                  <span className="font-semibold text-foreground/80">dae_path</span> {analysis.daePath}
                </span>
                <span>
                  <span className="font-semibold text-foreground/80">up_axis</span> {analysis.upAxis}
                </span>
                <span>
                  <span className="font-semibold text-foreground/80">geometries</span> {analysis.geometryNames.length}
                </span>
                <span>
                  <span className="font-semibold text-foreground/80">bones</span> {analysis.boneCount}
                </span>
                <span className={analysis.canConvert ? "text-emerald-600" : "text-destructive"}>
                  <span className="font-semibold text-foreground/80">can_convert</span> {String(analysis.canConvert)}
                </span>
              </div>

              {analysis.boneNames.length > 0 ? (
                <div className="mb-2">
                  <span className="text-[10px] font-semibold text-muted-foreground">Bone names ({analysis.boneNames.length})</span>
                  <ScrollArea className="mt-1 max-h-[120px] rounded border border-border/50 p-2">
                    <pre className="whitespace-pre-wrap break-all font-mono text-[9px] leading-relaxed">
                      {analysis.boneNames.join("\n")}
                    </pre>
                  </ScrollArea>
                </div>
              ) : null}

              {analysis.blockingErrors.length > 0 ? (
                <div className="mb-2">
                  <span className="text-[10px] font-semibold text-destructive">Blocking errors</span>
                  <ScrollArea className="mt-1 max-h-[220px] rounded border border-destructive/30 p-2">
                    <pre className="whitespace-pre-wrap break-all font-mono text-[9px]">{analysis.blockingErrors.join("\n\n")}</pre>
                  </ScrollArea>
                </div>
              ) : null}

              {analysis.warnings.length > 0 ? (
                <div className="mb-2">
                  <span className="text-[10px] font-semibold text-amber-600">Warnings ({analysis.warnings.length})</span>
                  <ScrollArea className="mt-1 max-h-[200px] rounded border border-amber-500/30 p-2">
                    <ul className="list-disc space-y-0.5 pl-4 text-[9px]">
                      {analysis.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </ScrollArea>
                </div>
              ) : null}

              <span className="text-[10px] font-semibold text-muted-foreground">Include geometries</span>
              <ScrollArea className="mt-1 max-h-[140px] rounded border border-border/50 p-2">
                <div className="flex flex-col gap-1 pr-2">
                  {analysis.geometryNames.map((g, gi) => (
                    <label key={`${gi}:${g}`} className="flex cursor-pointer items-center gap-2">
                      <Checkbox
                        checked={importGeomPick.has(g)}
                        onCheckedChange={(c) => {
                          setImportGeomPick((prev) => {
                            const n = new Set(prev);
                            if (c === true) n.add(g);
                            else n.delete(g);
                            return n;
                          });
                        }}
                        className="h-3.5 w-3.5"
                      />
                      <span className="font-mono text-[10px]">{g}</span>
                    </label>
                  ))}
                </div>
              </ScrollArea>

              <div className="mt-2 overflow-auto rounded border border-border/40">
                <table className="w-full min-w-[520px] border-collapse text-[9px]">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left">
                      <th className="sticky left-0 z-[1] bg-muted/90 p-1">name</th>
                      <th className="p-1">vtx</th>
                      <th className="p-1">idx</th>
                      <th className="p-1">tris</th>
                      <th className="p-1">nrm</th>
                      <th className="p-1">uv</th>
                      <th className="p-1">nrm=vtx</th>
                      <th className="p-1">uv=vtx</th>
                      <th className="p-1">bone_grp</th>
                      <th className="p-1">max_inf</th>
                      <th className="p-1">inf≤4</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.meshRows.map((row, ri) => (
                      <tr key={`${ri}:${row.name}`} className="border-b border-border/30">
                        <td className="sticky left-0 max-w-[140px] truncate bg-background/95 p-1 font-mono" title={row.name}>
                          {row.name}
                        </td>
                        <td className="p-1 font-mono">{row.vertexCount}</td>
                        <td className="p-1 font-mono">{row.indexCount}</td>
                        <td className="p-1 font-mono">{row.triangleCount}</td>
                        <td className="p-1 font-mono">{row.normalCount}</td>
                        <td className="p-1 font-mono">{row.uvCount}</td>
                        <td className="p-1 font-mono">{row.normalsMatchVertices ? "yes" : "no"}</td>
                        <td className="p-1 font-mono">{row.uvsMatchVertices ? "yes" : "no"}</td>
                        <td className="p-1 font-mono">{row.boneInfluenceGroups}</td>
                        <td className="p-1 font-mono">{row.maxInfluencesPerVertex}</td>
                        <td className="p-1 font-mono">{row.exceedsFourInfluences ? "no" : "yes"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-1">
            <Label className="text-[10px] text-muted-foreground">Base filename</Label>
            <Input value={importBase} onChange={(e) => setImportBase(e.target.value)} className="h-8 text-[11px]" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground">Scale</Label>
              <Input type="text" inputMode="decimal" value={importScale} onChange={(e) => setImportScale(e.target.value)} className="h-8 text-[11px]" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground">Up axis</Label>
              <select className={daeSelectClass} value={importUp} onChange={(e) => setImportUp(e.target.value as SsbhDaeUpAxis)}>
                <option value="y_up">Y-up</option>
                <option value="z_up">Z-up</option>
                <option value="none">None</option>
              </select>
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox checked={importFlipV} onCheckedChange={(c) => setImportFlipV(c === true)} className="h-3.5 w-3.5" />
            <span className="text-[10px] text-muted-foreground">Flip UV V</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox checked={writeLog} onCheckedChange={(c) => setWriteLog(c === true)} className="h-3.5 w-3.5" />
            <span className="text-[10px] text-muted-foreground">Write {`{base}_dae_to_ssbh.log`} in output folder</span>
          </label>

          <div className="rounded border border-border/50">
            <button
              type="button"
              onClick={() => setOutputFilesOpen(!outputFilesOpen)}
              className="flex w-full items-center gap-2 bg-muted/20 px-2 py-1.5 text-left hover:bg-muted/35"
            >
              {outputFilesOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Output files</span>
            </button>
            {outputFilesOpen ? (
              <div className="space-y-2 border-t border-border/40 p-2">
                <label className="flex cursor-pointer items-center gap-2">
                  <Checkbox checked={writeNumdlb} onCheckedChange={(c) => onToggleNumdlb(c === true)} className="h-3.5 w-3.5" />
                  <span className="font-mono text-[10px]">.numdlb</span>
                  <span className="text-[9px] text-muted-foreground">(requires .numshb + .nusktb)</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <Checkbox
                    checked={writeNumshb}
                    disabled={writeNumdlb}
                    onCheckedChange={(c) => setWriteNumshb(c === true)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="font-mono text-[10px]">.numshb</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <Checkbox
                    checked={writeNusktb}
                    disabled={writeNumdlb}
                    onCheckedChange={(c) => setWriteNusktb(c === true)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="font-mono text-[10px]">.nusktb</span>
                </label>
              </div>
            ) : null}
          </div>

          <Button
            type="button"
            size="sm"
            className="h-8 w-full text-[11px]"
            disabled={!daePath || p.loading || busy !== null}
            onClick={() => {
              void (async () => {
                if (!daePath) return;
                if (!writeNumdlb && !writeNumshb && !writeNusktb) {
                  toast.error("Select at least one output file.");
                  return;
                }
                if (writeNumdlb && (!writeNumshb || !writeNusktb)) {
                  toast.error(".numdlb requires both .numshb and .nusktb in this pipeline.");
                  return;
                }
                const base = importBase.trim();
                if (!base) {
                  toast.error("Base filename is required.");
                  return;
                }
                const scale = Number.parseFloat(importScale.trim());
                if (!Number.isFinite(scale) || scale <= 0) {
                  toast.error("Import scale must be a positive number.");
                  return;
                }
                if (analysis && importGeomPick.size === 0) {
                  toast.error("Select at least one geometry to include.");
                  return;
                }
                const outDir = await open({
                  title: "Output folder",
                  directory: true,
                  multiple: false,
                  defaultPath: p.workspaceRoot ?? undefined,
                });
                if (typeof outDir !== "string" || !outDir.trim()) return;
                setBusy("import");
                try {
                  const res = await ssbhConvertDaeToSsbh({
                    daePath,
                    outputDir: outDir.trim(),
                    baseFilename: base,
                    scaleFactor: scale,
                    flipUv: importFlipV,
                    upAxis: importUp,
                    includeGeometryNames: geometryFilterForInvoke,
                    writeLog,
                    writeNumdlb,
                    writeNumshb,
                    writeNusktb,
                  });
                  setLastOutputDir(outDir.trim());
                  setLastLogPath(res.logPath);
                  const lines = [
                    res.files.numdlbPath && `numdlb: ${res.files.numdlbPath}`,
                    res.files.numshbPath && `numshb: ${res.files.numshbPath}`,
                    res.files.nusktbPath && `nusktb: ${res.files.nusktbPath}`,
                    `mesh_objects=${res.stats.meshObjects} vertices=${res.stats.totalVertices} triangle_indices=${res.stats.totalTriangleIndices} bones=${res.stats.bones}`,
                    res.logPath ? `log: ${res.logPath}` : null,
                  ].filter(Boolean);
                  toast.success("Converted to SSBH", { description: lines.join("\n") });
                  const numdlbPath = res.files.numdlbPath?.trim();
                  if (numdlbPath) {
                    await p.loadModelAt(numdlbPath);
                  }
                } catch (e) {
                  toast.error(String(e));
                } finally {
                  setBusy(null);
                }
              })();
            }}
          >
            {busy === "import" ? "Converting…" : "Convert to SSBH"}
          </Button>

          {(lastOutputDir || lastLogPath) && (
            <div className="flex flex-wrap gap-2">
              {lastOutputDir ? (
                <Button type="button" size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => void openPath(lastOutputDir)}>
                  Open output folder
                </Button>
              ) : null}
              {lastLogPath ? (
                <Button type="button" size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => void openPath(lastLogPath)}>
                  Open log
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </DaeToolSection>
    </div>
  );
}
