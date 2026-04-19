import { useCallback, useEffect, useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { Bone, ChevronDown, ChevronRight, Database, Eye, EyeOff, FileDown, Info, Layout, List, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { DialogLastPathKey, getDialogDefaultPath, rememberDialogSelection } from "@/utils/dialogLastPath";
import { MayaSection } from "./MayaInspectorSection";
import {
  clearNutexbPreviewCacheAsync,
  getNutexbPreviewCacheStats,
  type NutexbPreviewCacheStats,
} from "./nutexbPreviewCache";
import { useSsbhModelPreview, type PreviewRenderStyle } from "./SsbhModelPreviewContext";
import { TEXTURE_PREVIEW_SLOT_META, TEXTURE_SLOT_TO_PATH_FIELD, buildMatlLookup } from "./meshFromSsbh";
import { ssbhExportFolderToDae, type SsbhDaeUpAxis } from "./ssbhDaeIoService";
import type { BoneJson, MatlDataJson, SkelDataJson } from "./types";

function boneHierarchyDepth(bones: BoneJson[], i: number): number {
  let d = 0;
  let p = bones[i]?.parent_index;
  while (p !== null && p !== undefined && p >= 0) {
    d++;
    p = bones[p]?.parent_index;
  }
  return d;
}

function meshFileStem(meshPath: string): string {
  const seg = meshPath.replace(/\\/g, "/").split("/").filter((x) => x.length > 0).pop() ?? "model";
  const i = seg.lastIndexOf(".");
  return i > 0 ? seg.slice(0, i) : seg;
}

export function SsbhModelPreviewInspector() {
  const p = useSsbhModelPreview();
  const [boneListMode, setBoneListMode] = useState<"active" | "all">("active");
  const [collapsedBoneGroups, setCollapsedBoneGroups] = useState<Set<string>>(new Set());
  const [textureCacheStats, setTextureCacheStats] = useState<NutexbPreviewCacheStats | null>(null);
  const [daeExportScaleText, setDaeExportScaleText] = useState("1");
  const [daeExportUpAxis, setDaeExportUpAxis] = useState<SsbhDaeUpAxis>("y_up");
  const [daeExportNumatbTextures, setDaeExportNumatbTextures] = useState(false);
  const [daeExportBusy, setDaeExportBusy] = useState(false);
  const canExportPreviewToDae =
    Boolean(p.bundle?.modlPath) && (p.bundle?.sourceKind ?? "disk") === "disk";
  const refreshTextureCacheStats = useCallback(async () => {
    setTextureCacheStats(await getNutexbPreviewCacheStats());
  }, []);
  useEffect(() => {
    void refreshTextureCacheStats();
  }, [refreshTextureCacheStats]);

  const exportPreviewToDae = useCallback(async () => {
    const bundle = p.bundle;
    const modlPath = bundle?.modlPath?.trim();
    const modelFolder = bundle?.rootFolder?.trim();
    if (!bundle || !modlPath) {
      throw new Error("No model loaded: open a folder or .numdlb in the viewport first.");
    }
    if ((bundle.sourceKind ?? "disk") !== "disk") {
      throw new Error("DAE export is not available for in-memory preview bundles.");
    }
    const scale = Number(daeExportScaleText);
    if (!Number.isFinite(scale) || scale <= 0) {
      throw new Error("Scale must be a finite positive number.");
    }
    const meshPath = bundle.meshPath;
    const suggestedName = `${meshFileStem(meshPath)}.dae`;
    const folder = getDialogDefaultPath(
      DialogLastPathKey.ssbhDaeExportDae,
      p.workspaceRoot ?? modelFolder,
    );
    const defaultPath = folder
      ? `${folder.replace(/[/\\]+$/, "")}${folder.includes("\\") ? "\\" : "/"}${suggestedName}`
      : suggestedName;

    const outputDaePath = await save({
      title: "Export preview mesh to COLLADA",
      filters: [{ name: "COLLADA", extensions: ["dae"] }],
      defaultPath,
    });
    if (typeof outputDaePath !== "string" || !outputDaePath.trim()) {
      return;
    }
    const out = outputDaePath.trim();
    setDaeExportBusy(true);
    try {
      const { daePath, stats } = await ssbhExportFolderToDae({
        rootPath: modlPath,
        outputDaePath: out,
        scaleFactor: scale,
        upAxis: daeExportUpAxis,
        includeMeshObjects: null,
        exportNumatbTextures: daeExportNumatbTextures,
      });
      rememberDialogSelection(DialogLastPathKey.ssbhDaeExportDae, daePath, "file");
      const texLine =
        stats.texturesExported > 0 ? ` · PNG textures: ${stats.texturesExported}` : "";
      toast.success("Exported COLLADA", {
        description: `${daePath}\nObjects: ${stats.objectsExported} · Triangles: ${stats.trianglesExported}${texLine}`,
      });
    } finally {
      setDaeExportBusy(false);
    }
  }, [p.bundle, p.workspaceRoot, daeExportScaleText, daeExportUpAxis, daeExportNumatbTextures]);

  const scopedDraws = useMemo(
    () => {
      const visibleInstances = p.previewInstances.filter((i) => !p.hiddenPreviewInstanceIds.has(i.id));
      const controlledInstanceIds =
        p.previewControlScope === "all"
          ? new Set(visibleInstances.map((i) => i.id))
          : new Set(
              visibleInstances
                .filter((i) => i.id === (p.activePreviewInstanceId ?? p.previewInstances[0]?.id ?? ""))
                .map((i) => i.id),
            );
      if (controlledInstanceIds.size === 0) return [];
      return p.draws.filter((d) => {
        const id = d.previewInstanceId ?? p.previewInstances[0]?.id ?? null;
        return id !== null && controlledInstanceIds.has(id);
      });
    },
    [
      p.draws,
      p.previewInstances,
      p.hiddenPreviewInstanceIds,
      p.previewControlScope,
      p.activePreviewInstanceId,
    ],
  );

  const visibleInstances = useMemo(() => {
    const byVisibility = p.previewInstances.filter((i) => !p.hiddenPreviewInstanceIds.has(i.id));
    if (p.previewViewMode === "single") {
      if (byVisibility.length === 0) return [];
      const active =
        (p.activePreviewInstanceId
          ? byVisibility.find((i) => i.id === p.activePreviewInstanceId)
          : null) ?? byVisibility[0]!;
      return [active];
    }
    return byVisibility;
  }, [p.previewInstances, p.hiddenPreviewInstanceIds, p.previewViewMode, p.activePreviewInstanceId]);

  const activeInstance =
    visibleInstances.find((i) => i.id === (p.activePreviewInstanceId ?? "")) ??
    visibleInstances[0] ??
    null;
  const skel = activeInstance?.bundle?.skel ? (activeInstance.bundle.skel as SkelDataJson) : null;
  const bones = skel?.bones ?? [];
  const boneListInstances = boneListMode === "all" ? visibleInstances : activeInstance ? [activeInstance] : [];
  const hasSkinnedMesh = scopedDraws.some((d) => d.skin !== null);
  const debugRows = scopedDraws
    .map((d) => {
      const binding = p.drawMaterialBindingsByDrawKey.get(d.key);
      const dataUrls = p.drawMaterialDataUrlsByDrawKey.get(d.key);
      const unresolvedRefs = binding
        ? Object.entries(binding.textureRefs).filter(([, ref]) => !!ref).length -
          Object.values(binding.texturePaths).filter((path) => !!path).length
        : 0;
      return {
        key: d.key,
        materialLabel: d.materialLabel,
        shaderLabel: binding?.shaderLabel ?? "",
        shaderFamily: binding?.shaderFamily ?? "generic",
        unresolvedRefs: Math.max(0, unresolvedRefs),
        hasCube: Boolean(dataUrls?.cubeMap),
      };
    })
    .slice(0, 20);
  const selectedDebugRow =
    debugRows.find((r) => r.key === p.selectedDebugDrawKey) ??
    (debugRows.length > 0 ? debugRows[0] : null);
  const selectedBinding = selectedDebugRow
    ? p.drawMaterialBindingsByDrawKey.get(selectedDebugRow.key)
    : undefined;
  const selectedDataUrls = selectedDebugRow
    ? p.drawMaterialDataUrlsByDrawKey.get(selectedDebugRow.key)
    : undefined;
  const activeBundle = activeInstance?.bundle ?? p.bundle ?? null;
  const activeMatlLookup = useMemo(
    () => buildMatlLookup((activeBundle?.matl as MatlDataJson | null | undefined) ?? null),
    [activeBundle],
  );
  const activeTextureResolveRows = activeBundle?.textureResolve ?? [];
  const unresolvedTextureResolveRows = useMemo(
    () => activeTextureResolveRows.filter((row) => !row.nutexbPath),
    [activeTextureResolveRows],
  );
  const missingMaterialLabelRows = useMemo(() => {
    if (!activeBundle) return [];
    const rows = scopedDraws
      .filter((d) => !activeMatlLookup.has(d.materialLabel))
      .map((d) => `${d.materialLabel} <- ${d.meshObjectName}[${d.meshObjectSubindex}]`);
    return Array.from(new Set(rows)).sort((a, b) => a.localeCompare(b));
  }, [activeBundle, scopedDraws, activeMatlLookup]);

  return (
    <div className="-mx-4 flex min-w-0 flex-col border-t bg-background/50">
      {p.loading || p.textureDecoding ? (
        <div
          className="border-b border-border/60 bg-muted/25 px-3 py-1.5 text-[10px] text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          {p.loading ? (
            <span>Loading model from disk…</span>
          ) : (
            <span
              className="block truncate"
              title={p.textureDecodeProgress?.currentLabel ?? undefined}
            >
              Decoding unique textures ({p.textureDecodeProgress?.done ?? 0}/{p.textureDecodeProgress?.total ?? 0}
              {p.textureDecodeProgress?.currentLabel ? ` — ${p.textureDecodeProgress.currentLabel}` : ""})
            </span>
          )}
        </div>
      ) : null}
      {p.previewInstances.length > 0 ? (
        <MayaSection title="Collection" icon={<Layout className="h-3.5 w-3.5" />}>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-[10px] text-muted-foreground">View range</Label>
                <ToggleGroup
                  type="single"
                  value={p.previewViewMode}
                  onValueChange={(v) => {
                    if (v) p.setPreviewViewMode(v as typeof p.previewViewMode);
                  }}
                  variant="outline"
                  className="flex w-full justify-start gap-1"
                >
                  <ToggleGroupItem value="all" className="h-7 px-2 text-[10px]">All models</ToggleGroupItem>
                  <ToggleGroupItem value="single" className="h-7 px-2 text-[10px]">Active only</ToggleGroupItem>
                </ToggleGroup>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-[10px] text-muted-foreground">Control range</Label>
                <ToggleGroup
                  type="single"
                  value={p.previewControlScope}
                  onValueChange={(v) => {
                    if (v) p.setPreviewControlScope(v as typeof p.previewControlScope);
                  }}
                  variant="outline"
                  className="flex w-full justify-start gap-1"
                >
                  <ToggleGroupItem value="all" className="h-7 px-2 text-[10px]">All models</ToggleGroupItem>
                  <ToggleGroupItem value="single" className="h-7 px-2 text-[10px]">Active only</ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-[10px] text-muted-foreground">{p.previewInstances.length} models in collection</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[9px] uppercase tracking-tighter"
                onClick={p.showAllPreviewInstances}
              >
                Show all
              </Button>
            </div>
            <div className="max-h-[220px] space-y-1 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-muted">
              {p.previewInstances.map((inst) => {
                const visible = !p.hiddenPreviewInstanceIds.has(inst.id);
                const active = inst.id === (p.activePreviewInstanceId ?? p.previewInstances[0]?.id ?? "");
                return (
                  <div
                    key={inst.id}
                    className={cn(
                      "flex items-center gap-1.5 rounded-sm border px-2 py-1.5",
                      active ? "border-primary/55 bg-primary/10" : "border-border/40",
                    )}
                  >
                    <button
                      type="button"
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      title={visible ? "Hide model" : "Show model"}
                      onClick={() => p.setPreviewInstanceVisible(inst.id, !visible)}
                    >
                      {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => p.setActivePreviewInstanceId(inst.id)}
                    >
                      <div className="truncate text-[11px] font-medium leading-tight">{inst.displayLabel}</div>
                      <div className="truncate font-mono text-[9px] text-muted-foreground">{inst.modlPath}</div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </MayaSection>
      ) : null}
      <MayaSection title="Display Settings" icon={<Settings2 className="h-3.5 w-3.5" />}>
        <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label className="text-[11px] text-muted-foreground" title="Bloom + warm key lights (water-anime-shader style)">
              Preview render style
            </Label>
            <Select
              value={p.previewRenderStyle}
              onValueChange={(v) => p.setPreviewRenderStyle(v as PreviewRenderStyle)}
            >
              <SelectTrigger className="h-8 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard" className="text-[11px]">
                  Standard
                </SelectItem>
                <SelectItem value="anime" className="text-[11px]">
                  Anime (bloom + warm lights)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[11px] text-muted-foreground">Wireframe</Label>
            <Switch checked={p.wireframe} onCheckedChange={p.setWireframe} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[11px] text-muted-foreground">Skeleton</Label>
            <Switch checked={p.showSkeleton} onCheckedChange={p.setShowSkeleton} disabled={!p.bundle?.skel} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[11px] text-muted-foreground">Grid</Label>
            <Switch checked={p.showGrid} onCheckedChange={p.setShowGrid} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[11px] text-muted-foreground">Axes</Label>
            <Switch checked={p.showAxesGizmo} onCheckedChange={p.setShowAxesGizmo} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[11px] text-muted-foreground">Stats</Label>
            <Switch checked={p.showStats} onCheckedChange={p.setShowStats} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[11px] text-muted-foreground">Texture Flip Y</Label>
            <Switch checked={p.textureFlipY} onCheckedChange={p.setTextureFlipY} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[11px] text-muted-foreground" title="Mirror mesh UV horizontally (U → 1−U)">
              Flip UV U
            </Label>
            <Switch checked={p.uvFlipU} onCheckedChange={p.setUvFlipU} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[11px] text-muted-foreground" title="Mirror mesh UV vertically (V → 1−V)">
              Flip UV V
            </Label>
            <Switch checked={p.uvFlipV} onCheckedChange={p.setUvFlipV} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[11px] text-muted-foreground">Normal Map</Label>
            <Switch checked={p.normalMapEnabled} onCheckedChange={p.setNormalMapEnabled} />
          </div>
        </div>
      </MayaSection>

      <MayaSection title="Export COLLADA" icon={<FileDown className="h-3.5 w-3.5" />} defaultOpen={false}>
        <div className="flex flex-col gap-3">
          <p className="text-[9px] leading-snug text-muted-foreground">
            Writes the same mesh (and skeleton when present) as the 3D preview from the loaded model folder to a .dae file.
            Optional: export diffuse nutexb textures referenced in numatb as PNG next to the DAE and bind them in the COLLADA file.
          </p>
          {p.bundle?.modlPath ? (
            <p className="truncate font-mono text-[10px] text-muted-foreground" title={p.bundle.modlPath}>
              NUMDLB: {p.bundle.modlPath}
            </p>
          ) : (
            <p className="text-[10px] text-muted-foreground">Load a model in the viewport to enable export.</p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-[11px] text-muted-foreground">Scale</Label>
              <Input
                className="h-8 text-[11px]"
                value={daeExportScaleText}
                onChange={(e) => setDaeExportScaleText(e.target.value)}
                disabled={!canExportPreviewToDae || p.previewBusy || daeExportBusy}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-[11px] text-muted-foreground">Up axis</Label>
              <Select
                value={daeExportUpAxis}
                onValueChange={(v) => setDaeExportUpAxis(v as SsbhDaeUpAxis)}
                disabled={!canExportPreviewToDae || p.previewBusy || daeExportBusy}
              >
                <SelectTrigger className="h-8 text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="y_up" className="text-[11px]">
                    Y-up
                  </SelectItem>
                  <SelectItem value="z_up" className="text-[11px]">
                    Z-up
                  </SelectItem>
                  <SelectItem value="none" className="text-[11px]">
                    None
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <label className="flex cursor-pointer items-start gap-2 text-[11px] leading-snug">
            <Checkbox
              checked={daeExportNumatbTextures}
              onCheckedChange={(c) => setDaeExportNumatbTextures(c === true)}
              disabled={!canExportPreviewToDae || p.previewBusy || daeExportBusy}
              className="mt-0.5"
            />
            <span className="text-muted-foreground">
              Export numatb diffuse textures (nutexb → PNG in the same folder as the .dae, update DAE references)
            </span>
          </label>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-8 w-fit text-[10px] uppercase tracking-wide"
            disabled={!canExportPreviewToDae || p.previewBusy || daeExportBusy}
            onClick={() => {
              void exportPreviewToDae().catch((err) => {
                toast.error(String(err));
              });
            }}
          >
            <FileDown className="mr-1.5 h-3.5 w-3.5" />
            {daeExportBusy ? "Exporting…" : "Export to .dae…"}
          </Button>
        </div>
      </MayaSection>

      <MayaSection title="Texture cache" icon={<Database className="h-3.5 w-3.5" />} defaultOpen={false}>
        <div className="flex flex-col gap-2">
          <p className="text-[9px] leading-snug text-muted-foreground">
            Keys use full-file CRC32 (IEEE) from Rust; any nutexb byte change produces a new key. Clearing revokes in-memory
            blob URLs and removes persisted PNG entries (IndexedDB).
          </p>
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
            <span>
              Memory: {textureCacheStats?.memoryEntries ?? "—"} · Persistent:{" "}
              {textureCacheStats?.idbEntries === null || textureCacheStats?.idbEntries === undefined
                ? "n/a"
                : textureCacheStats.idbEntries}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[9px]"
              onClick={() => void refreshTextureCacheStats()}
            >
              Refresh stats
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="h-7 px-2 text-[9px]"
              onClick={async () => {
                await clearNutexbPreviewCacheAsync();
                await refreshTextureCacheStats();
                toast.success("Texture preview cache cleared");
              }}
            >
              Clear all
            </Button>
          </div>
        </div>
      </MayaSection>

      <MayaSection title="Material Debug" icon={<Info className="h-3.5 w-3.5" />} defaultOpen={false}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] text-muted-foreground">Debug view mode</Label>
            <Select value={p.materialDebugViewMode} onValueChange={(v) => p.setMaterialDebugViewMode(v as typeof p.materialDebugViewMode)}>
              <SelectTrigger className="h-8 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full" className="text-[11px]">Full</SelectItem>
                <SelectItem value="baseColor" className="text-[11px]">Base color only</SelectItem>
                <SelectItem value="normals" className="text-[11px]">Normals only</SelectItem>
                <SelectItem value="roughnessMetalness" className="text-[11px]">Roughness/metalness</SelectItem>
                <SelectItem value="emissive" className="text-[11px]">Emissive only</SelectItem>
                <SelectItem value="reflection" className="text-[11px]">Reflection only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] text-muted-foreground">Inspect draw</Label>
            <Select
              value={p.selectedDebugDrawKey ?? "__none__"}
              onValueChange={(v) => p.setSelectedDebugDrawKey(v === "__none__" ? null : v)}
              disabled={debugRows.length === 0}
            >
              <SelectTrigger className="h-8 text-[11px]">
                <SelectValue placeholder="Select draw" />
              </SelectTrigger>
              <SelectContent className="max-h-[220px]">
                <SelectItem value="__none__" className="text-[11px]">
                  None
                </SelectItem>
                {debugRows.map((r) => (
                  <SelectItem key={r.key} value={r.key} className="text-[11px] font-mono">
                    {r.materialLabel} ({r.key})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="max-h-[220px] space-y-1 overflow-y-auto pr-1 text-[10px]">
            {debugRows.map((r) => (
              <div key={r.key} className="rounded border border-border/60 p-2">
                <div className="font-medium">{r.materialLabel}</div>
                <div className="font-mono text-muted-foreground">{r.shaderLabel || "shader: <none>"}</div>
                <div className="mt-1 flex items-center gap-2 text-[9px] uppercase text-muted-foreground">
                  <span>{r.shaderFamily}</span>
                  <span>{r.hasCube ? "cubemap:on" : "cubemap:off"}</span>
                  <span>{r.unresolvedRefs > 0 ? `unresolved:${r.unresolvedRefs}` : "resolved"}</span>
                </div>
              </div>
            ))}
            {!debugRows.length ? (
              <span className="text-[10px] italic text-muted-foreground">No materials available</span>
            ) : null}
          </div>
          <div className="min-w-0 space-y-2 rounded border border-border/60 p-2">
            <div className="font-medium text-[11px]">Preview texture decoding</div>
            <p className="text-[9px] leading-snug text-muted-foreground">
              Uncheck a slot to skip loading that texture for all meshes (faster preview, less GPU memory). Paths below
              still show what the material references on disk.
            </p>
            <div className="flex flex-wrap gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[9px]"
                onClick={() => p.setAllTextureSlotsLoadEnabled(true)}
              >
                Load all
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[9px]"
                onClick={() => p.setAllTextureSlotsLoadEnabled(false)}
              >
                Load none
              </Button>
            </div>
            <div className="grid max-h-[200px] grid-cols-1 gap-x-3 gap-y-1.5 overflow-y-auto overflow-x-hidden pr-0.5 sm:grid-cols-2">
              {TEXTURE_PREVIEW_SLOT_META.map(({ key, label }) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-start gap-2 rounded-sm border border-transparent py-0.5 hover:bg-muted/25"
                >
                  <Checkbox
                    checked={p.textureSlotLoadEnabled[key]}
                    onCheckedChange={(c) => p.setTextureSlotLoadEnabled(key, c === true)}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  />
                  <span className="min-w-0 flex-1 text-[10px] leading-tight">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {selectedDebugRow && selectedBinding ? (
            <div className="min-w-0 overflow-hidden rounded border border-border/60">
              <div className="border-b border-border/50 bg-muted/20 px-2 py-1.5">
                <div className="font-medium text-[11px]">Selected Material Details</div>
                <div className="mt-1 wrap-break-word font-mono text-[10px] text-muted-foreground leading-snug">
                  {selectedBinding.materialLabel}
                </div>
                <div className="wrap-break-word font-mono text-[10px] text-muted-foreground leading-snug">
                  {selectedBinding.shaderLabel || "<no shader>"}
                </div>
              </div>
              <div className="max-h-[min(42vh,360px)] overflow-y-auto overflow-x-hidden px-2 py-2">
                <div className="space-y-2 text-[10px]">
                  {TEXTURE_PREVIEW_SLOT_META.map(({ key, short }) => {
                    const pathField = TEXTURE_SLOT_TO_PATH_FIELD[key];
                    const diskPath = selectedBinding.texturePaths[pathField] ?? null;
                    const loadOn = p.textureSlotLoadEnabled[key];
                    const decoded = selectedDataUrls?.[key];
                    const sampling =
                      key === "map"
                        ? selectedBinding.sampling.map
                        : key === "normalMap"
                          ? selectedBinding.sampling.normal
                          : key === "roughnessMap"
                            ? selectedBinding.sampling.roughness
                            : key === "metalnessMap"
                              ? selectedBinding.sampling.metalness
                              : key === "emissiveMap"
                                ? selectedBinding.sampling.emissive
                                : key === "aoMap"
                                  ? selectedBinding.sampling.ao
                                  : null;
                    let decodeLabel: string;
                    if (!loadOn) {
                      decodeLabel = "skipped";
                    } else if (decoded) {
                      decodeLabel = "decoded";
                    } else if (diskPath) {
                      decodeLabel = "failed or pending";
                    } else {
                      decodeLabel = "none";
                    }
                    return (
                      <div key={key} className="min-w-0 border-b border-border/40 pb-2 last:border-b-0 last:pb-0">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="shrink-0 font-medium text-foreground">{short}</span>
                          <span
                            className={
                              decodeLabel === "decoded"
                                ? "text-emerald-600/90 dark:text-emerald-400/90"
                                : decodeLabel === "skipped"
                                  ? "text-muted-foreground"
                                  : "text-amber-700/90 dark:text-amber-400/90"
                            }
                          >
                            {decodeLabel}
                          </span>
                        </div>
                        <div className="mt-0.5 break-all font-mono text-[9px] leading-relaxed text-muted-foreground">
                          {diskPath ?? "<no path>"}
                        </div>
                        {sampling ? (
                          <div className="mt-1 font-mono text-[9px] leading-relaxed text-muted-foreground">
                            {`wrapS=${sampling.wrapS} wrapT=${sampling.wrapT} `}
                            {sampling.uvTransform
                              ? `uv=scale(${sampling.uvTransform.scale_u.toFixed(3)}, ${sampling.uvTransform.scale_v.toFixed(3)}) rotate(${sampling.uvTransform.rotation.toFixed(3)}) translate(${sampling.uvTransform.translate_u.toFixed(3)}, ${sampling.uvTransform.translate_v.toFixed(3)})`
                              : "uv=<identity>"}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </MayaSection>

      <MayaSection title="Lighting & Environment" icon={<Layout className="h-3.5 w-3.5" />} defaultOpen={false}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] text-muted-foreground">Ambient</Label>
              <span className="text-[10px] font-mono">{p.ambientIntensity.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.05}
              value={p.ambientIntensity}
              onChange={(e) => p.setAmbientIntensity(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] text-muted-foreground">Directional</Label>
              <span className="text-[10px] font-mono">{p.directionalIntensity.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={2.5}
              step={0.05}
              value={p.directionalIntensity}
              onChange={(e) => p.setDirectionalIntensity(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] text-muted-foreground">Light X</Label>
                <span className="text-[10px] font-mono">{p.directionalX.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min={-20}
                max={20}
                step={0.5}
                value={p.directionalX}
                onChange={(e) => p.setDirectionalX(Number(e.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] text-muted-foreground">Light Y</Label>
                <span className="text-[10px] font-mono">{p.directionalY.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min={1}
                max={24}
                step={0.5}
                value={p.directionalY}
                onChange={(e) => p.setDirectionalY(Number(e.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] text-muted-foreground">Light Z</Label>
                <span className="text-[10px] font-mono">{p.directionalZ.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min={-20}
                max={20}
                step={0.5}
                value={p.directionalZ}
                onChange={(e) => p.setDirectionalZ(Number(e.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] text-muted-foreground">Background Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={p.background}
                onChange={(e) => p.setBackground(e.target.value)}
                className="h-8 w-12 cursor-pointer rounded border-0 bg-transparent p-0"
              />
              <span className="text-[10px] font-mono uppercase">{p.background}</span>
            </div>
          </div>
        </div>
      </MayaSection>

      <MayaSection title="Mesh Explorer" icon={<List className="h-3.5 w-3.5" />}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-[10px] text-muted-foreground">{scopedDraws.length} total meshes</span>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[9px] uppercase tracking-tighter"
                onClick={p.showAllMeshes}
              >
                All
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[9px] uppercase tracking-tighter"
                onClick={p.hideAllMeshes}
              >
                None
              </Button>
            </div>
          </div>
          <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-muted">
            {scopedDraws.map((d) => (
              <label
                key={d.key}
                className="flex cursor-pointer items-start gap-2 rounded-sm p-1 transition-colors hover:bg-muted/30"
              >
                <Checkbox
                  checked={p.visibleKeys.has(d.key)}
                  onCheckedChange={(c) => p.toggleVisible(d.key, c === true)}
                  className="mt-0.5 h-3.5 w-3.5"
                />
                <div className="flex flex-col leading-tight">
                  <span className="wrap-break-word text-[11px] font-medium">{d.label}</span>
                  <span className="text-[9px] text-muted-foreground">{d.materialLabel}</span>
                </div>
              </label>
            ))}
            {!scopedDraws.length && (
              <span className="py-4 text-center text-[10px] italic text-muted-foreground">No meshes loaded</span>
            )}
          </div>
        </div>
      </MayaSection>

      <MayaSection title="Bone Explorer" icon={<Bone className="h-3.5 w-3.5" />}>
        <div className="flex flex-col gap-3">
          <p className="text-[9px] leading-snug text-muted-foreground">
            Hierarchy matches the skeleton. Select a bone here or click joint spheres in the viewport, then drag the
            gizmo. With the 3D view focused: Maya-style{" "}
            <span className="font-mono text-foreground">W / E / R</span> (or{" "}
            <span className="font-mono text-foreground">1 / 2 / 3</span>) for Move / Rotate / Scale;{" "}
            <span className="font-mono text-foreground">Ctrl+Z</span> undo /{" "}
            <span className="font-mono text-foreground">Ctrl+Shift+Z</span> or{" "}
            <span className="font-mono text-foreground">Ctrl+Y</span> redo bone transforms;{" "}
            <span className="font-mono text-foreground">Esc</span> clears the active bone. Orbit pauses while dragging
            the gizmo.
          </p>
          {!hasSkinnedMesh && p.selectedBoneIndex !== null && bones.length > 0 ? (
            <p className="text-[10px] text-amber-600/90 dark:text-amber-400/90">
              This model has no per-vertex bone weights in the mesh JSON — skeleton lines will move but geometry will not
              deform.
            </p>
          ) : null}
          {p.previewInstances.length > 1 ? (
            <div className="flex flex-col gap-1.5">
              <Label className="text-[10px] text-muted-foreground">Bone list scope</Label>
              <ToggleGroup
                type="single"
                value={boneListMode}
                onValueChange={(v) => {
                  if (v === "active" || v === "all") setBoneListMode(v);
                }}
                variant="outline"
                className="flex w-full justify-start gap-1"
              >
                <ToggleGroupItem value="active" className="h-7 px-2 text-[10px]">
                  Active model
                </ToggleGroupItem>
                <ToggleGroupItem value="all" className="h-7 px-2 text-[10px]">
                  All visible models
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label className="text-[10px] text-muted-foreground">Gizmo mode</Label>
            <ToggleGroup
              type="single"
              value={p.boneTransformMode}
              onValueChange={(v) => {
                if (v) p.setBoneTransformMode(v as typeof p.boneTransformMode);
              }}
              disabled={bones.length === 0 || p.selectedBoneIndex === null}
              variant="outline"
              className="flex w-full flex-wrap justify-start gap-1"
            >
              <ToggleGroupItem value="translate" className="h-8 flex-1 min-w-18 px-2 text-[10px]" aria-label="Move">
                Move
              </ToggleGroupItem>
              <ToggleGroupItem value="rotate" className="h-8 flex-1 min-w-18 px-2 text-[10px]" aria-label="Rotate">
                Rotate
              </ToggleGroupItem>
              <ToggleGroupItem value="scale" className="h-8 flex-1 min-w-18 px-2 text-[10px]" aria-label="Scale">
                Scale
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-[10px]"
            disabled={bones.length === 0}
            onClick={p.resetBonePose}
          >
            Reset bone pose
          </Button>
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-[10px] text-muted-foreground">
              {boneListMode === "all"
                ? `${boneListInstances.reduce((n, inst) => n + (((inst.bundle.skel as SkelDataJson | null)?.bones?.length) ?? 0), 0)} bones`
                : `${bones.length} bones`}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[9px] uppercase tracking-tighter"
              disabled={boneListInstances.length === 0}
              onClick={() => p.setSelectedBoneIndex(null)}
            >
              Clear selection
            </Button>
          </div>
          <div className="max-h-[300px] space-y-1 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-muted">
            {boneListInstances.map((inst) => {
              const instSkel = inst.bundle.skel ? (inst.bundle.skel as SkelDataJson) : null;
              const instBones = instSkel?.bones ?? [];
              const instActive = inst.id === (p.activePreviewInstanceId ?? "");
              return (
                <div key={inst.id} className="space-y-1">
                  {boneListMode === "all" ? (
                    <div
                      className={cn(
                        "flex items-center gap-1 rounded-sm border px-2 py-1",
                        instActive
                          ? "border-primary/55 bg-primary/12 text-foreground"
                          : "border-border/40 text-muted-foreground",
                      )}
                    >
                      <button
                        type="button"
                        className="shrink-0 hover:text-foreground"
                        title={
                          collapsedBoneGroups.has(inst.id) ? "Expand bone group" : "Collapse bone group"
                        }
                        onClick={() =>
                          setCollapsedBoneGroups((prev) => {
                            const next = new Set(prev);
                            if (next.has(inst.id)) next.delete(inst.id);
                            else next.add(inst.id);
                            return next;
                          })
                        }
                      >
                        {collapsedBoneGroups.has(inst.id) ? (
                          <ChevronRight className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left text-[10px] font-medium hover:text-foreground"
                        onClick={() => p.setActivePreviewInstanceId(inst.id)}
                        title={inst.modlPath}
                      >
                        {inst.displayLabel}
                      </button>
                    </div>
                  ) : null}
                  {(boneListMode === "all" && collapsedBoneGroups.has(inst.id) ? [] : instBones).map((b, i) => {
                    const depth = boneHierarchyDepth(instBones, i);
                    const active = instActive && p.selectedBoneIndex === i;
                    return (
                      <button
                        key={`${inst.id}_${b.name}_${i}`}
                        type="button"
                        className={cn(
                          "flex w-full min-w-0 flex-col rounded-sm border px-2 py-1.5 text-left transition-colors",
                          active
                            ? "border-primary/55 bg-primary/12"
                            : "border-border/40 hover:bg-muted/35",
                        )}
                        style={{ paddingLeft: `${10 + depth * 12}px` }}
                        onClick={() => {
                          p.setActivePreviewInstanceId(inst.id);
                          p.setSelectedBoneIndex(i);
                        }}
                      >
                        <span className="truncate text-[11px] font-medium leading-tight">{b.name}</span>
                        <span className="font-mono text-[9px] text-muted-foreground">[{i}]</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
            {boneListInstances.length === 0 ? (
              <span className="py-4 text-center text-[10px] italic text-muted-foreground">No skeleton loaded</span>
            ) : null}
          </div>
        </div>
      </MayaSection>

      <MayaSection title="Scene Statistics" icon={<Info className="h-3.5 w-3.5" />} defaultOpen={false}>
        <div className="grid grid-cols-2 gap-x-2 gap-y-3">
          <div className="flex flex-col">
            <span className="text-[9px] uppercase text-muted-foreground">Vertices</span>
            <span className="text-[11px] font-mono">{p.vertexTriangleStats.verts.toLocaleString()}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] uppercase text-muted-foreground">Triangles</span>
            <span className="text-[11px] font-mono">{p.vertexTriangleStats.tris.toLocaleString()}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] uppercase text-muted-foreground">Draw Calls</span>
            <span className="text-[11px] font-mono">{p.draws.length}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] uppercase text-muted-foreground">Textures</span>
            <span className="text-[11px] font-mono">{p.drawMaterialDataUrlsByDrawKey.size}</span>
          </div>
          <div className="flex flex-col col-span-2">
            <span className="text-[9px] uppercase text-muted-foreground">Bones</span>
            <span className="text-[11px] font-mono">
              {p.bundle?.skel ? (p.bundle.skel as SkelDataJson).bones?.length ?? 0 : "—"}
            </span>
          </div>
        </div>
      </MayaSection>

      {activeBundle ? (
        <MayaSection title="Preview Bundle Debug" icon={<Info className="h-3.5 w-3.5" />} defaultOpen={false}>
          <div className="flex flex-col gap-3 text-[10px]">
            <div className="space-y-1">
              <div className="text-[9px] uppercase text-muted-foreground">Active bundle</div>
              <div className="font-mono wrap-anywhere">{activeBundle.modlPath}</div>
              <div className="font-mono wrap-anywhere text-muted-foreground">{activeBundle.meshPath}</div>
            </div>

            <div className="grid grid-cols-2 gap-x-2 gap-y-2">
              <div className="flex flex-col">
                <span className="text-[9px] uppercase text-muted-foreground">Matl files loaded</span>
                <span className="font-mono">{activeBundle.matlPaths.length}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] uppercase text-muted-foreground">Matl entries merged</span>
                <span className="font-mono">{activeMatlLookup.size}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] uppercase text-muted-foreground">Texture refs</span>
                <span className="font-mono">{activeBundle.textureRefs.length}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] uppercase text-muted-foreground">Resolved nutexb</span>
                <span className="font-mono">{activeBundle.resolvedNutexbPaths.length}</span>
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-[9px] uppercase text-muted-foreground">Matl path list</div>
              <div className="max-h-[96px] space-y-1 overflow-y-auto pr-1">
                {activeBundle.matlPaths.length > 0 ? (
                  activeBundle.matlPaths.map((path) => (
                    <div key={path} className="font-mono wrap-anywhere text-muted-foreground">
                      {path}
                    </div>
                  ))
                ) : (
                  <div className="italic text-muted-foreground">No matl files loaded</div>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-[9px] uppercase text-muted-foreground">
                Draw labels missing in matl ({missingMaterialLabelRows.length})
              </div>
              <div className="max-h-[96px] space-y-1 overflow-y-auto pr-1">
                {missingMaterialLabelRows.length > 0 ? (
                  missingMaterialLabelRows.map((row) => (
                    <div key={row} className="font-mono wrap-anywhere text-amber-700/90 dark:text-amber-400/90">
                      {row}
                    </div>
                  ))
                ) : (
                  <div className="italic text-muted-foreground">All draw material labels exist in merged matl entries.</div>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-[9px] uppercase text-muted-foreground">
                Unresolved texture refs ({unresolvedTextureResolveRows.length}/{activeTextureResolveRows.length})
              </div>
              <div className="max-h-[132px] space-y-1 overflow-y-auto pr-1">
                {unresolvedTextureResolveRows.length > 0 ? (
                  unresolvedTextureResolveRows.slice(0, 120).map((row) => (
                    <div key={row.reference} className="font-mono wrap-anywhere text-amber-700/90 dark:text-amber-400/90">
                      {row.reference}
                    </div>
                  ))
                ) : (
                  <div className="italic text-muted-foreground">All collected texture refs resolved to on-disk .nutexb files.</div>
                )}
              </div>
            </div>
          </div>
        </MayaSection>
      ) : null}

      {p.bundle?.warnings?.length ? (
        <MayaSection title="Warnings" icon={<Info className="h-3.5 w-3.5 text-amber-500" />}>
          <div className="min-w-0 max-w-full">
            <ul className="list-disc space-y-1.5 pl-4 text-[10px] text-muted-foreground">
              {p.bundle.warnings.map((w, i) => (
                <li key={i} className="min-w-0 whitespace-normal wrap-anywhere">
                  {w}
                </li>
              ))}
            </ul>
          </div>
        </MayaSection>
      ) : null}
    </div>
  );
}
