import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, FileDown, FileInput, SlidersHorizontal } from "lucide-react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MayaSection } from "./MayaInspectorSection";
import { useSsbhModelPreview } from "./SsbhModelPreviewContext";
import {
  loadDaeExchangePresets,
  saveDaeExchangePresets,
  ssbhAnalyzeDae,
  ssbhAnalyzeFbx,
  ssbhConvertDaeToSsbh,
  ssbhConvertFbxToSsbh,
  ssbhExportFolderToDae,
  type SsbhDaeAnalysisReport,
  type SsbhDaeExchangePreset,
  type SsbhDaeUpAxis,
} from "./ssbhDaeIoService";

const daeSelectClass =
  "h-8 w-full rounded-md border border-input bg-background px-2 text-[11px] shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";

const scrollListClass = "max-h-[140px] space-y-1 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-muted";
const scrollListSmClass = "max-h-[120px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-muted";
const scrollListMdClass = "max-h-[200px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-muted";
const scrollListLgClass = "max-h-[220px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-muted";

const btnOutlineSm = "h-6 px-2 text-[9px] uppercase tracking-tighter";
const btnPrimarySm = "h-7 px-3 text-[10px] uppercase tracking-tighter";

function InspectorSubFold({
  title,
  open: openFold,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-sm border border-muted/80">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 bg-muted/20 px-2 py-1.5 transition-colors hover:bg-muted/40"
      >
        {openFold ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</span>
      </button>
      {openFold ? <div className="border-t border-muted/60 p-2">{children}</div> : null}
    </div>
  );
}

function isSsbhDaeUpAxis(v: unknown): v is SsbhDaeUpAxis {
  return v === "y_up" || v === "z_up" || v === "none";
}

type SsbhImportKind = "dae" | "fbx";

function isSsbhImportKind(v: unknown): v is SsbhImportKind {
  return v === "dae" || v === "fbx";
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

  const [importKind, setImportKind] = useState<SsbhImportKind>("dae");
  const [importSourcePath, setImportSourcePath] = useState<string | null>(null);
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
    <div className="-mx-4 flex flex-col border-t bg-background/50 text-[11px]">
      <MayaSection title="Parameter Presets" icon={<SlidersHorizontal className="h-3.5 w-3.5" />} defaultOpen={false}>
        <div className="flex flex-col gap-3">
          <p className="text-[10px] leading-snug text-muted-foreground">
            Stored in localStorage. Applies export/import scale, axis, flip, and log option.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-[140px] flex-col gap-1">
              <Label className="text-[11px] text-muted-foreground">Preset</Label>
              <select
                className={daeSelectClass}
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
            </div>
            {selectedPreset ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={btnOutlineSm}
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
            <div className="flex max-w-[160px] flex-col gap-1">
              <Label className="text-[11px] text-muted-foreground">New name</Label>
              <Input
                placeholder="Preset name"
                value={presetSaveName}
                onChange={(e) => setPresetSaveName(e.target.value)}
                className="h-8 text-[11px]"
              />
            </div>
            <Button type="button" variant="secondary" size="sm" className={btnPrimarySm} onClick={saveCurrentPreset}>
              Save
            </Button>
          </div>
        </div>
      </MayaSection>

      <MayaSection title="Export to COLLADA (SSBH → .dae)" icon={<FileDown className="h-3.5 w-3.5" />}>
        <div className="flex flex-col gap-4">
          <p className="text-[10px] leading-snug text-muted-foreground">
            Uses the model folder already loaded in Model Preview. Materials are not embedded; edit in a DCC and convert back
            in the section below.
          </p>
          <p className="text-[10px] leading-snug text-muted-foreground">
            Direct SSBH → FBX is not supported here (FBX import uses a read-only library). Export COLLADA and convert to FBX
            in Maya, Blender, or similar if you need <span className="font-mono">.fbx</span> output.
          </p>
          <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label className="text-[11px] text-muted-foreground">Scale</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={exportScale}
                onChange={(e) => setExportScale(e.target.value)}
                className="h-8 text-[11px]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[11px] text-muted-foreground">Up axis</Label>
              <select className={daeSelectClass} value={exportUp} onChange={(e) => setExportUp(e.target.value as SsbhDaeUpAxis)}>
                <option value="y_up">Y-up</option>
                <option value="z_up">Z-up</option>
                <option value="none">As stored</option>
              </select>
            </div>
          </div>
          <label className="flex cursor-pointer items-start gap-2 rounded-sm p-1 transition-colors hover:bg-muted/30">
            <Checkbox checked={exportSubset} onCheckedChange={(c) => setExportSubset(c === true)} className="mt-0.5 h-3.5 w-3.5" />
            <span className="text-[11px] leading-snug text-muted-foreground">
              Export only selected mesh objects (from Model Preview list)
            </span>
          </label>
          {exportSubset && p.draws.length > 0 ? (
            <div className={scrollListClass}>
              {p.draws.map((d) => (
                <label
                  key={d.key}
                  className="flex cursor-pointer items-start gap-2 rounded-sm p-1 transition-colors hover:bg-muted/30"
                >
                  <Checkbox
                    checked={exportKeys.has(d.key)}
                    onCheckedChange={(c) => toggleExportKey(d.key, c === true)}
                    className="mt-0.5 h-3.5 w-3.5"
                  />
                  <span className="font-mono text-[10px] leading-tight">
                    {d.meshObjectName} [{d.meshObjectSubindex}]
                  </span>
                </label>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-1">
            <Button
              type="button"
              size="sm"
              className={btnPrimarySm}
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
              <Button type="button" variant="outline" size="sm" className={btnOutlineSm} onClick={() => void openPath(lastExportDae)}>
                Open DAE
              </Button>
            ) : null}
          </div>
        </div>
      </MayaSection>

      <MayaSection title="Convert to SSBH (DAE / FBX → SSBH)" icon={<FileInput className="h-3.5 w-3.5" />}>
        <div className="flex flex-col gap-4">
          <p className="text-[10px] leading-snug text-muted-foreground">
            Writes selected formats into the output folder. .numdlb lists .numshb / .nusktb by base name; you still need a
            matching <span className="font-mono">.numatb</span> for in-game materials.
          </p>
          <div className="flex flex-col gap-1">
            <Label className="text-[11px] text-muted-foreground">Import format</Label>
            <select
              className={daeSelectClass}
              value={importKind}
              onChange={(e) => {
                const v = e.target.value;
                if (!isSsbhImportKind(v)) return;
                setImportKind(v);
                setImportSourcePath(null);
                setAnalysis(null);
                setImportGeomPick(new Set());
              }}
            >
              <option value="dae">COLLADA (.dae)</option>
              <option value="fbx">FBX (.fbx)</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={btnOutlineSm}
              disabled={busy !== null}
              onClick={() => {
                void (async () => {
                  const path = await open({
                    title: importKind === "dae" ? "COLLADA source" : "FBX source",
                    multiple: false,
                    filters:
                      importKind === "dae"
                        ? [{ name: "COLLADA", extensions: ["dae"] }]
                        : [{ name: "FBX", extensions: ["fbx"] }],
                    defaultPath: p.workspaceRoot ?? undefined,
                  });
                  if (typeof path !== "string" || !path.trim()) return;
                  setImportSourcePath(path.trim());
                  setAnalysis(null);
                  setImportGeomPick(new Set());
                })();
              }}
            >
              {importKind === "dae" ? "Pick .dae…" : "Pick .fbx…"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className={btnPrimarySm}
              disabled={!importSourcePath || busy !== null}
              onClick={() => {
                void (async () => {
                  if (!importSourcePath) return;
                  setBusy("analyze");
                  try {
                    const rep =
                      importKind === "dae"
                        ? await ssbhAnalyzeDae(importSourcePath)
                        : await ssbhAnalyzeFbx(importSourcePath);
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
          {importSourcePath ? (
            <p className="break-all font-mono text-[10px] text-muted-foreground">{importSourcePath}</p>
          ) : null}

          {analysis ? (
            <div className="flex flex-col gap-3 border-t border-muted/60 pt-3">
              <div className="grid grid-cols-2 gap-x-2 gap-y-2 sm:grid-cols-3">
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase text-muted-foreground">Geometries</span>
                  <span className="text-[11px] font-mono">{analysis.geometryNames.length}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase text-muted-foreground">Bones</span>
                  <span className="text-[11px] font-mono">{analysis.boneCount}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase text-muted-foreground">Can convert</span>
                  <span className={`text-[11px] font-mono ${analysis.canConvert ? "text-emerald-600" : "text-destructive"}`}>
                    {String(analysis.canConvert)}
                  </span>
                </div>
                <div className="col-span-2 flex flex-col sm:col-span-3">
                  <span className="text-[9px] uppercase text-muted-foreground">Up axis</span>
                  <span className="text-[11px] font-mono">{analysis.upAxis}</span>
                </div>
              </div>
              <p className="break-all font-mono text-[9px] text-muted-foreground">{analysis.daePath}</p>

              {analysis.boneNames.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] uppercase text-muted-foreground">Bone names ({analysis.boneNames.length})</span>
                  <div className={`rounded-sm border border-muted/80 bg-muted/10 p-2 ${scrollListSmClass}`}>
                    <pre className="whitespace-pre-wrap break-all font-mono text-[9px] leading-relaxed">
                      {analysis.boneNames.join("\n")}
                    </pre>
                  </div>
                </div>
              ) : null}

              {analysis.blockingErrors.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] uppercase text-destructive">Blocking errors</span>
                  <div className={`rounded-sm border border-destructive/30 bg-destructive/5 p-2 ${scrollListLgClass}`}>
                    <pre className="whitespace-pre-wrap break-all font-mono text-[9px]">{analysis.blockingErrors.join("\n\n")}</pre>
                  </div>
                </div>
              ) : null}

              {analysis.warnings.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] uppercase text-amber-600">Warnings ({analysis.warnings.length})</span>
                  <div className={`rounded-sm border border-amber-500/25 bg-amber-500/5 p-2 ${scrollListMdClass}`}>
                    <ul className="list-disc space-y-0.5 pl-4 text-[10px] text-muted-foreground">
                      {analysis.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-col gap-1">
                <span className="text-[9px] uppercase text-muted-foreground">Include geometries</span>
                <div className={`rounded-sm border border-muted/80 p-2 ${scrollListClass}`}>
                  <div className="flex flex-col gap-0.5">
                    {analysis.geometryNames.map((g, gi) => (
                      <label
                        key={`${gi}:${g}`}
                        className="flex cursor-pointer items-start gap-2 rounded-sm p-1 transition-colors hover:bg-muted/30"
                      >
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
                          className="mt-0.5 h-3.5 w-3.5"
                        />
                        <span className="font-mono text-[10px] leading-tight">{g}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="overflow-auto rounded-sm border border-muted/80">
                <table className="w-full min-w-[520px] border-collapse text-[9px]">
                  <thead>
                    <tr className="border-b border-muted bg-muted/30 text-left">
                      <th className="sticky left-0 z-1 bg-muted/90 p-1">name</th>
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
                      <tr key={`${ri}:${row.name}`} className="border-b border-muted/40">
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

          <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
            <div className="flex flex-col gap-1 sm:col-span-2">
              <Label className="text-[11px] text-muted-foreground">Base filename</Label>
              <Input value={importBase} onChange={(e) => setImportBase(e.target.value)} className="h-8 text-[11px]" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[11px] text-muted-foreground">Scale</Label>
              <Input type="text" inputMode="decimal" value={importScale} onChange={(e) => setImportScale(e.target.value)} className="h-8 text-[11px]" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[11px] text-muted-foreground">Up axis</Label>
              <select className={daeSelectClass} value={importUp} onChange={(e) => setImportUp(e.target.value as SsbhDaeUpAxis)}>
                <option value="y_up">Y-up</option>
                <option value="z_up">Z-up</option>
                <option value="none">None</option>
              </select>
            </div>
          </div>
          <label className="flex cursor-pointer items-start gap-2 rounded-sm p-1 transition-colors hover:bg-muted/30">
            <Checkbox checked={importFlipV} onCheckedChange={(c) => setImportFlipV(c === true)} className="mt-0.5 h-3.5 w-3.5" />
            <span className="text-[11px] text-muted-foreground">Flip UV V</span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 rounded-sm p-1 transition-colors hover:bg-muted/30">
            <Checkbox checked={writeLog} onCheckedChange={(c) => setWriteLog(c === true)} className="mt-0.5 h-3.5 w-3.5" />
            <span className="text-[11px] text-muted-foreground">
              Write {`{base}_${importKind}_to_ssbh.log`} in output folder
            </span>
          </label>

          <InspectorSubFold title="Output files" open={outputFilesOpen} onToggle={() => setOutputFilesOpen(!outputFilesOpen)}>
            <label className="flex cursor-pointer items-center gap-2 rounded-sm p-1 hover:bg-muted/25">
              <Checkbox checked={writeNumdlb} onCheckedChange={(c) => onToggleNumdlb(c === true)} className="h-3.5 w-3.5" />
              <span className="font-mono text-[10px]">.numdlb</span>
              <span className="text-[9px] text-muted-foreground">(requires .numshb + .nusktb)</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-sm p-1 hover:bg-muted/25">
              <Checkbox
                checked={writeNumshb}
                disabled={writeNumdlb}
                onCheckedChange={(c) => setWriteNumshb(c === true)}
                className="h-3.5 w-3.5"
              />
              <span className="font-mono text-[10px]">.numshb</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-sm p-1 hover:bg-muted/25">
              <Checkbox
                checked={writeNusktb}
                disabled={writeNumdlb}
                onCheckedChange={(c) => setWriteNusktb(c === true)}
                className="h-3.5 w-3.5"
              />
              <span className="font-mono text-[10px]">.nusktb</span>
            </label>
          </InspectorSubFold>

          <Button
            type="button"
            size="sm"
            className="h-8 w-full text-[10px] font-medium uppercase tracking-wide"
            disabled={!importSourcePath || p.loading || busy !== null}
            onClick={() => {
              void (async () => {
                if (!importSourcePath) return;
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
                  const common = {
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
                  };
                  const res =
                    importKind === "dae"
                      ? await ssbhConvertDaeToSsbh({ daePath: importSourcePath, ...common })
                      : await ssbhConvertFbxToSsbh({ fbxPath: importSourcePath, ...common });
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
            <div className="flex flex-wrap gap-1 border-t border-muted/60 pt-3">
              {lastOutputDir ? (
                <Button type="button" variant="outline" size="sm" className={btnOutlineSm} onClick={() => void openPath(lastOutputDir)}>
                  Open output folder
                </Button>
              ) : null}
              {lastLogPath ? (
                <Button type="button" variant="outline" size="sm" className={btnOutlineSm} onClick={() => void openPath(lastLogPath)}>
                  Open log
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </MayaSection>
    </div>
  );
}
