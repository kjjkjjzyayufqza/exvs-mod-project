import { useCallback, useEffect, useState } from "react";
import { Database, Info, Layout, List, Settings2 } from "lucide-react";
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
import { MayaSection } from "./MayaInspectorSection";
import {
  clearNutexbPreviewCacheAsync,
  getNutexbPreviewCacheStats,
  type NutexbPreviewCacheStats,
} from "./nutexbPreviewCache";
import { useSsbhModelPreview, type PreviewRenderStyle } from "./SsbhModelPreviewContext";
import { TEXTURE_PREVIEW_SLOT_META, TEXTURE_SLOT_TO_PATH_FIELD } from "./meshFromSsbh";
import type { SkelDataJson } from "./types";

export function SsbhModelPreviewInspector() {
  const p = useSsbhModelPreview();
  const [textureCacheStats, setTextureCacheStats] = useState<NutexbPreviewCacheStats | null>(null);
  const refreshTextureCacheStats = useCallback(async () => {
    setTextureCacheStats(await getNutexbPreviewCacheStats());
  }, []);
  useEffect(() => {
    void refreshTextureCacheStats();
  }, [refreshTextureCacheStats]);
  const skel = p.bundle?.skel ? (p.bundle.skel as SkelDataJson) : null;
  const bones = skel?.bones ?? [];
  const hasSkinnedMesh = p.draws.some((d) => d.skin !== null);
  const debugRows = p.draws
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

  return (
    <div className="-mx-4 flex min-w-0 flex-col border-t bg-background/50">
      {p.previewBusy ? (
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
              Decoding textures ({p.textureDecodeProgress?.done ?? 0}/{p.textureDecodeProgress?.total ?? 0}
              {p.textureDecodeProgress?.currentLabel ? ` — ${p.textureDecodeProgress.currentLabel}` : ""})
            </span>
          )}
        </div>
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

      <MayaSection title="Bone pose (preview)" icon={<Settings2 className="h-3.5 w-3.5" />} defaultOpen={false}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[11px] text-muted-foreground">Enable bone control</Label>
            <Switch
              checked={p.bonePoseEnabled}
              onCheckedChange={p.setBonePoseEnabled}
              disabled={!skel || bones.length === 0}
            />
          </div>
          <p className="text-[10px] leading-snug text-muted-foreground">
            Drag gizmo on the selected bone (translate / rotate / scale). Orbit is disabled while dragging the gizmo.
            CPU skinning updates rigged meshes; turn off to restore bind pose.
          </p>
          {!hasSkinnedMesh && p.bonePoseEnabled ? (
            <p className="text-[10px] text-amber-600/90 dark:text-amber-400/90">
              This model has no per-vertex bone weights in the mesh JSON — skeleton lines will move but geometry will
              not deform.
            </p>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label className="text-[10px] text-muted-foreground">Selected bone</Label>
            <Select
              disabled={!p.bonePoseEnabled || bones.length === 0}
              value={p.selectedBoneIndex === null ? "__none__" : String(p.selectedBoneIndex)}
              onValueChange={(v) => p.setSelectedBoneIndex(v === "__none__" ? null : Number(v))}
            >
              <SelectTrigger className="h-8 text-[11px]">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent className="max-h-[220px]">
                <SelectItem value="__none__" className="text-[11px]">
                  None
                </SelectItem>
                {bones.map((b, i) => (
                  <SelectItem key={`${b.name}_${i}`} value={String(i)} className="text-[11px] font-mono">
                    [{i}] {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[10px] text-muted-foreground">Gizmo mode</Label>
            <Select
              disabled={!p.bonePoseEnabled}
              value={p.boneTransformMode}
              onValueChange={(v) => p.setBoneTransformMode(v as "translate" | "rotate" | "scale")}
            >
              <SelectTrigger className="h-8 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="translate" className="text-[11px]">
                  Move
                </SelectItem>
                <SelectItem value="rotate" className="text-[11px]">
                  Rotate
                </SelectItem>
                <SelectItem value="scale" className="text-[11px]">
                  Scale
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-[10px]"
            disabled={!p.bonePoseEnabled}
            onClick={p.resetBonePose}
          >
            Reset bone pose
          </Button>
        </div>
      </MayaSection>

      <MayaSection title="Mesh Explorer" icon={<List className="h-3.5 w-3.5" />}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-[10px] text-muted-foreground">{p.draws.length} total meshes</span>
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
            {p.draws.map((d) => (
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
            {!p.draws.length && (
              <span className="py-4 text-center text-[10px] italic text-muted-foreground">No meshes loaded</span>
            )}
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

      {p.bundle?.warnings?.length ? (
        <MayaSection title="Warnings" icon={<Info className="h-3.5 w-3.5 text-amber-500" />}>
          <div className="min-w-0 max-w-full">
            <ul className="list-disc space-y-1.5 pl-4 text-[10px] text-muted-foreground">
              {p.bundle.warnings.map((w, i) => (
                <li key={i} className="min-w-0 break-words whitespace-normal [overflow-wrap:anywhere]">
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
