import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { save } from "@tauri-apps/plugin-dialog";
import { Bone, ChevronDown, ChevronRight, Database, Eye, EyeOff, FileDown, Info, Layout, List, Search, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
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
import { Slider } from "@/components/ui/slider";
import { DialogLastPathKey, getDialogDefaultPath, rememberDialogSelection } from "@/utils/dialogLastPath";
import { MayaSection } from "./MayaInspectorSection";
import {
  clearNutexbPreviewCacheAsync,
  getNutexbPreviewCacheStats,
  type NutexbPreviewCacheStats,
} from "./nutexbPreviewCache";
import {
  useSsbhModelPreview,
  type PreviewRenderStyle,
  type PreviewLightingPreset,
  PREVIEW_LIGHTING_PRESET_META,
  matchPreviewLightingPreset,
} from "./SsbhModelPreviewContext";
import { TEXTURE_PREVIEW_SLOT_META, TEXTURE_SLOT_TO_PATH_FIELD, buildMatlLookup } from "./meshFromSsbh";
import { lookupTextureData } from "./ssbhTextureUpload";
import { ssbhExportFolderToDae, type SsbhDaeUpAxis } from "./ssbhDaeIoService";
import { hasAnyPreviewSkeleton } from "./ssbhPreviewSkeletonVisibility";
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

export type SsbhModelPreviewInspectorLayout = "padded" | "flush";

type SsbhModelPreviewInspectorProps = {
  /** padded: bleed into a parent with horizontal padding (-mx-4). flush: stay within narrow side panels. */
  layout?: SsbhModelPreviewInspectorLayout;
};

export function SsbhModelPreviewInspector({ layout = "padded" }: SsbhModelPreviewInspectorProps) {
  const { t } = useTranslation("ssbh-inspector");
  const isFlush = layout === "flush";
  const pairGridClass = isFlush ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2";
  const tripleGridClass = isFlush ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-3";
  const p = useSsbhModelPreview();
  const skeletonToggleEnabled = hasAnyPreviewSkeleton(p.previewInstances);
  const [boneListMode, setBoneListMode] = useState<"active" | "all">("active");
  const [collapsedBoneGroups, setCollapsedBoneGroups] = useState<Set<string>>(new Set());
  const [textureCacheStats, setTextureCacheStats] = useState<NutexbPreviewCacheStats | null>(null);
  const [daeExportScaleText, setDaeExportScaleText] = useState("1");
  const [daeExportUpAxis, setDaeExportUpAxis] = useState<SsbhDaeUpAxis>("y_up");
  const [daeExportNumatbTextures, setDaeExportNumatbTextures] = useState(false);
  const [daeExportBusy, setDaeExportBusy] = useState(false);
  const collectionListRef = useRef<HTMLDivElement>(null);
  const meshListRef = useRef<HTMLDivElement>(null);
  const boneListRef = useRef<HTMLDivElement>(null);
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
      title: t("actions.exportPreviewMesh"),
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
        stats.texturesExported > 0 ? t("success.pngTextures", { count: stats.texturesExported }) : "";
      toast.success(t("success.exportedCollada"), {
        description: t("success.exportSummary", { path: daePath, objects: stats.objectsExported, triangles: stats.trianglesExported, textures: texLine }),
      });
    } finally {
      setDaeExportBusy(false);
    }
  }, [p.bundle, p.workspaceRoot, daeExportScaleText, daeExportUpAxis, daeExportNumatbTextures, t]);

  const scopedDraws = useMemo(
    () => {
      const visibleInstances = p.previewInstances.filter((i) => !p.hiddenPreviewInstanceIds.has(i.id));
      const controlledInstanceIds =
        p.previewControlScope === "all"
          ? new Set(visibleInstances.map((i) => i.id))
          : p.activePreviewInstanceId
            ? new Set(
                visibleInstances
                  .filter((i) => i.id === p.activePreviewInstanceId)
                  .map((i) => i.id),
              )
            : new Set<string>();
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
      if (!p.activePreviewInstanceId) return [];
      const active = byVisibility.find((i) => i.id === p.activePreviewInstanceId);
      return active ? [active] : [];
    }
    return byVisibility;
  }, [p.previewInstances, p.hiddenPreviewInstanceIds, p.previewViewMode, p.activePreviewInstanceId]);

  const activeInstance = p.activePreviewInstanceId
    ? (visibleInstances.find((i) => i.id === p.activePreviewInstanceId) ?? null)
    : null;
  const skel = activeInstance?.bundle?.skel ? (activeInstance.bundle.skel as SkelDataJson) : null;
  const bones = skel?.bones ?? [];
  const boneListInstances = useMemo(
    () => (boneListMode === "all" ? visibleInstances : activeInstance ? [activeInstance] : []),
    [activeInstance, boneListMode, visibleInstances],
  );
  const hasSkinnedMesh = scopedDraws.some((d) => d.skin !== null);
  const debugRows = useMemo(
    () =>
      scopedDraws
        .slice(0, 20)
        .map((d) => {
          const binding = p.drawMaterialBindingsByDrawKey.get(d.key);
          const cubePath = binding?.texturePaths.cubePath ?? null;
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
            hasCube: Boolean(cubePath && lookupTextureData(p.textureDataMap, cubePath)),
          };
        }),
    [p.drawMaterialBindingsByDrawKey, p.textureDataMap, scopedDraws],
  );
  const selectedDebugRow =
    debugRows.find((r) => r.key === p.selectedDebugDrawKey) ??
    (debugRows.length > 0 ? debugRows[0] : null);
  const selectedBinding = selectedDebugRow
    ? p.drawMaterialBindingsByDrawKey.get(selectedDebugRow.key)
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
  const boneListRows = useMemo(() => {
    type Instance = (typeof boneListInstances)[number];
    type Row =
      | { kind: "group"; instance: Instance }
      | { kind: "bone"; instance: Instance; bone: BoneJson; boneIndex: number; depth: number };
    const rows: Row[] = [];
    for (const instance of boneListInstances) {
      const instanceSkeleton = instance.bundle.skel
        ? (instance.bundle.skel as SkelDataJson)
        : null;
      const instanceBones = instanceSkeleton?.bones ?? [];
      if (boneListMode === "all") {
        rows.push({ kind: "group", instance });
      }
      if (boneListMode === "all" && collapsedBoneGroups.has(instance.id)) continue;
      for (let boneIndex = 0; boneIndex < instanceBones.length; boneIndex += 1) {
        rows.push({
          kind: "bone",
          instance,
          bone: instanceBones[boneIndex],
          boneIndex,
          depth: boneHierarchyDepth(instanceBones, boneIndex),
        });
      }
    }
    return rows;
  }, [boneListInstances, boneListMode, collapsedBoneGroups]);
  const totalBoneCount = useMemo(
    () =>
      boneListMode === "all"
        ? boneListInstances.reduce(
            (count, instance) =>
              count + ((instance.bundle.skel as SkelDataJson | null)?.bones?.length ?? 0),
            0,
          )
        : bones.length,
    [boneListInstances, boneListMode, bones.length],
  );
  const collectionVirtualizer = useVirtualizer({
    count: p.previewCollectionItems.length,
    getScrollElement: () => collectionListRef.current,
    estimateSize: () => 54,
    getItemKey: (index) => p.previewCollectionItems[index]?.id ?? index,
    overscan: 5,
  });
  const meshVirtualizer = useVirtualizer({
    count: scopedDraws.length,
    getScrollElement: () => meshListRef.current,
    estimateSize: () => 48,
    getItemKey: (index) => scopedDraws[index]?.key ?? index,
    overscan: 6,
  });
  const boneVirtualizer = useVirtualizer({
    count: boneListRows.length,
    getScrollElement: () => boneListRef.current,
    estimateSize: (index) => (boneListRows[index]?.kind === "group" ? 32 : 44),
    getItemKey: (index) => {
      const row = boneListRows[index];
      return row?.kind === "group"
        ? `group-${row.instance.id}`
        : `${row?.instance.id}-${row?.boneIndex}`;
    },
    overscan: 8,
  });

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col border-t bg-background/50",
        isFlush ? "w-full max-w-full overflow-hidden" : "-mx-4",
      )}
    >
      {p.loading || p.textureDecoding ? (
        <div
          className="border-b border-border/60 bg-muted/25 px-3 py-1.5 text-[10px] text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          {p.loading ? (
          <span>{t("states.loadingModel")}</span>
          ) : (
            <span
              className="block truncate"
              title={p.textureDecodeProgress?.currentLabel ?? undefined}
            >
              {t("states.decodingTextures", { done: p.textureDecodeProgress?.done ?? 0, total: p.textureDecodeProgress?.total ?? 0, current: p.textureDecodeProgress?.currentLabel ? ` — ${p.textureDecodeProgress.currentLabel}` : "" })}
            </span>
          )}
        </div>
      ) : null}
      {p.previewInstances.length > 0 ? (
          <MayaSection title={t("sections.collection")} icon={<Layout className="h-3.5 w-3.5" />}>
          <div className="flex flex-col gap-3">
            <div className={cn("grid gap-2", pairGridClass)}>
              <div className="flex flex-col gap-1.5">
                <Label className="text-[10px] text-muted-foreground">{t("labels.viewRange")}</Label>
                <ToggleGroup
                  type="single"
                  value={p.previewViewMode}
                  onValueChange={(v) => {
                    if (v) p.setPreviewViewMode(v as typeof p.previewViewMode);
                  }}
                  variant="outline"
                  className="flex w-full justify-start gap-1"
                >
                  <ToggleGroupItem value="all" className="h-7 px-2 text-[10px]">{t("filters.allModels")}</ToggleGroupItem>
                  <ToggleGroupItem value="single" className="h-7 px-2 text-[10px]">{t("filters.activeOnly")}</ToggleGroupItem>
                </ToggleGroup>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-[10px] text-muted-foreground">{t("labels.controlRange")}</Label>
                <ToggleGroup
                  type="single"
                  value={p.previewControlScope}
                  onValueChange={(v) => {
                    if (v) p.setPreviewControlScope(v as typeof p.previewControlScope);
                  }}
                  variant="outline"
                  className="flex w-full justify-start gap-1"
                >
                  <ToggleGroupItem value="all" className="h-7 px-2 text-[10px]">{t("filters.allModels")}</ToggleGroupItem>
                  <ToggleGroupItem value="single" className="h-7 px-2 text-[10px]">{t("filters.activeOnly")}</ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-[10px] text-muted-foreground">{t("labels.collectionSearch")}</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="h-8 pl-7 text-[11px]"
                  value={p.previewCollectionQuery}
                  onChange={(event) => p.setPreviewCollectionQuery(event.target.value)}
                  placeholder={t("search.placeholder")}
                />
              </div>
            </div>
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-[10px] text-muted-foreground">
                {t("stats.modelsShown", { shown: p.previewCollectionItems.length, total: p.previewInstances.length })}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[9px] uppercase tracking-tighter"
                onClick={p.showAllPreviewInstances}
              >
                {p.previewCollectionAllVisible ? t("actions.hideAll") : t("actions.showAll")}
              </Button>
            </div>
            <div ref={collectionListRef} className="h-[220px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-muted">
              <div className="relative w-full" style={{ height: collectionVirtualizer.getTotalSize() }}>
                {collectionVirtualizer.getVirtualItems().map((virtualRow) => {
                  const inst = p.previewCollectionItems[virtualRow.index];
                  const visible = !p.hiddenPreviewInstanceIds.has(inst.id);
                  const active = inst.id === p.activePreviewInstanceId;
                  return (
                    <div
                      key={virtualRow.key}
                      className="absolute left-0 top-0 w-full pb-1"
                      style={{
                        height: virtualRow.size,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <div
                        className={cn(
                          "flex h-full items-center gap-1.5 rounded-sm border px-2 py-1.5",
                          active ? "border-primary/55 bg-primary/10" : "border-border/40",
                        )}
                      >
                        <button
                          type="button"
                          className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                          title={visible ? t("actions.hideModel") : t("actions.showModel")}
                          onClick={() => p.setPreviewInstanceVisible(inst.id, !visible)}
                        >
                          {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          className="min-w-0 flex-1 cursor-pointer text-left"
                          onClick={() => {
                            if (inst.id === p.activePreviewInstanceId) {
                              p.setActivePreviewInstanceId(null);
                              p.setSelectionOutlineEnabled(false);
                              return;
                            }
                            // Inspect list is the only path that enables yellow selection.
                            p.setSelectionOutlineEnabled(true);
                            p.setActivePreviewInstanceId(inst.id);
                          }}
                        >
                          <div className="truncate text-[11px] font-medium leading-tight">{inst.displayLabel}</div>
                          <div className="truncate font-mono text-[9px] text-muted-foreground">{inst.modlPath}</div>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </MayaSection>
      ) : null}
      <MayaSection title={t("sections.displaySettings")} icon={<Settings2 className="h-3.5 w-3.5" />}>
        <div className={cn("grid gap-x-4 gap-y-2", pairGridClass)}>
          <div className={cn("flex flex-col gap-1.5", !isFlush && "sm:col-span-2")}>
            <Label className="text-[11px] text-muted-foreground" title={t("help.bloomLights")}>
              {t("labels.previewRenderStyle")}
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
                  {t("renderStyle.standard")}
                </SelectItem>
                <SelectItem value="anime" className="text-[11px]">
                  {t("renderStyle.anime")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[11px] text-muted-foreground">{t("labels.wireframe")}</Label>
            <Switch checked={p.wireframe} onCheckedChange={p.setWireframe} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[11px] text-muted-foreground">{t("labels.skeleton")}</Label>
            <Switch checked={p.showSkeleton} onCheckedChange={p.setShowSkeleton} disabled={!skeletonToggleEnabled} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[11px] text-muted-foreground">{t("labels.grid")}</Label>
            <Switch checked={p.showGrid} onCheckedChange={p.setShowGrid} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[11px] text-muted-foreground">{t("labels.axes")}</Label>
            <Switch checked={p.showAxesGizmo} onCheckedChange={p.setShowAxesGizmo} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[11px] text-muted-foreground">{t("labels.stats")}</Label>
            <Switch checked={p.showStats} onCheckedChange={p.setShowStats} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[11px] text-muted-foreground">{t("labels.textureFlipY")}</Label>
            <Switch checked={p.textureFlipY} onCheckedChange={p.setTextureFlipY} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[11px] text-muted-foreground" title={t("help.flipUvU")}>
              {t("labels.flipUvU")}
            </Label>
            <Switch checked={p.uvFlipU} onCheckedChange={p.setUvFlipU} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[11px] text-muted-foreground" title={t("help.flipUvV")}>
              {t("labels.flipUvV")}
            </Label>
            <Switch checked={p.uvFlipV} onCheckedChange={p.setUvFlipV} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[11px] text-muted-foreground">{t("labels.normalMap")}</Label>
            <Switch checked={p.normalMapEnabled} onCheckedChange={p.setNormalMapEnabled} />
          </div>
        </div>
      </MayaSection>

      <MayaSection title={t("sections.exportCollada")} icon={<FileDown className="h-3.5 w-3.5" />} defaultOpen={false}>
        <div className="flex flex-col gap-3">
          <p className="text-[9px] leading-snug text-muted-foreground">
            {t("help.exportCollada")}
          </p>
          {p.bundle?.modlPath ? (
            <p className="truncate font-mono text-[10px] text-muted-foreground" title={p.bundle.modlPath} data-i18n-ignore="">
              NUMDLB: {p.bundle.modlPath}
            </p>
          ) : (
            <p className="text-[10px] text-muted-foreground">{t("export.loadModelFirst")}</p>
          )}
          <div className={cn("grid grid-cols-1 gap-3", !isFlush && "sm:grid-cols-2")}>
            <div className="flex flex-col gap-1.5">
              <Label className="text-[11px] text-muted-foreground">{t("labels.scale")}</Label>
              <Input
                className="h-8 text-[11px]"
                value={daeExportScaleText}
                onChange={(e) => setDaeExportScaleText(e.target.value)}
                disabled={!canExportPreviewToDae || p.previewBusy || daeExportBusy}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-[11px] text-muted-foreground">{t("labels.upAxis")}</Label>
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
                    {t("upAxis.yUp")}
                  </SelectItem>
                  <SelectItem value="z_up" className="text-[11px]">
                    {t("upAxis.zUp")}
                  </SelectItem>
                  <SelectItem value="none" className="text-[11px]">
                    {t("upAxis.none")}
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
              {t("export.numatbTextures")}
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
            {daeExportBusy ? t("actions.exporting") : t("actions.exportDae")}
          </Button>
        </div>
      </MayaSection>

      <MayaSection title={t("sections.textureCache")} icon={<Database className="h-3.5 w-3.5" />} defaultOpen={false}>
        <div className="flex flex-col gap-2">
          <p className="text-[9px] leading-snug text-muted-foreground">
            {t("help.textureCache")}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
            <span>
              {t("stats.memory")} {textureCacheStats?.memoryEntries ?? "—"} · {t("stats.persistent")}{" "}
              {textureCacheStats?.idbEntries === null || textureCacheStats?.idbEntries === undefined
                ? t("stats.notAvailable")
                : textureCacheStats.idbEntries}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[9px]"
              onClick={() => void refreshTextureCacheStats()}
            >
              {t("actions.refreshStats")}
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
                toast.success(t("success.cacheCleared"));
              }}
            >
              {t("actions.clearAll")}
            </Button>
          </div>
        </div>
      </MayaSection>

      <MayaSection title={t("sections.materialDebug")} icon={<Info className="h-3.5 w-3.5" />} defaultOpen={false}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] text-muted-foreground">{t("labels.debugViewMode")}</Label>
            <Select value={p.materialDebugViewMode} onValueChange={(v) => p.setMaterialDebugViewMode(v as typeof p.materialDebugViewMode)}>
              <SelectTrigger className="h-8 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full" className="text-[11px]">{t("debugView.full")}</SelectItem>
                <SelectItem value="baseColor" className="text-[11px]">{t("debugView.baseColor")}</SelectItem>
                <SelectItem value="normals" className="text-[11px]">{t("debugView.normals")}</SelectItem>
                <SelectItem value="roughnessMetalness" className="text-[11px]">{t("debugView.roughnessMetalness")}</SelectItem>
                <SelectItem value="emissive" className="text-[11px]">{t("debugView.emissive")}</SelectItem>
                <SelectItem value="reflection" className="text-[11px]">{t("debugView.reflection")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] text-muted-foreground">{t("labels.inspectDraw")}</Label>
            <Select
              value={p.selectedDebugDrawKey ?? "__none__"}
              onValueChange={(v) => p.setSelectedDebugDrawKey(v === "__none__" ? null : v)}
              disabled={debugRows.length === 0}
            >
              <SelectTrigger className="h-8 text-[11px]">
                <SelectValue placeholder={t("material.selectDraw")} />
              </SelectTrigger>
              <SelectContent className="max-h-[220px]">
                <SelectItem value="__none__" className="text-[11px]">
                  {t("material.none")}
                </SelectItem>
                {debugRows.map((r) => (
                  <SelectItem key={r.key} value={r.key} className="text-[11px] font-mono" data-i18n-ignore="">
                    {r.materialLabel} ({r.key})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="max-h-[220px] space-y-1 overflow-y-auto pr-1 text-[10px]">
            {debugRows.map((r) => (
              <div key={r.key} className="rounded border border-border/60 p-2" data-i18n-ignore="">
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
              <span className="text-[10px] italic text-muted-foreground">{t("material.noMaterials")}</span>
            ) : null}
          </div>
          <div className="min-w-0 space-y-2 rounded border border-border/60 p-2">
            <div className="font-medium text-[11px]">{t("material.previewDecoding")}</div>
            <p className="text-[9px] leading-snug text-muted-foreground">
              {t("help.previewDecoding")}
            </p>
            <div className="flex flex-wrap gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[9px]"
                onClick={() => p.setAllTextureSlotsLoadEnabled(true)}
              >
                {t("actions.loadAll")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[9px]"
                onClick={() => p.setAllTextureSlotsLoadEnabled(false)}
              >
                {t("actions.loadNone")}
              </Button>
            </div>
            <div
              className={cn(
                "grid max-h-[200px] grid-cols-1 gap-x-3 gap-y-1.5 overflow-y-auto overflow-x-hidden pr-0.5",
                !isFlush && "sm:grid-cols-2",
              )}
              data-i18n-ignore=""
            >
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
                <div className="font-medium text-[11px]">{t("material.selectedDetails")}</div>
                <div className="mt-1 wrap-break-word font-mono text-[10px] text-muted-foreground leading-snug" data-i18n-ignore="">
                  {selectedBinding.materialLabel}
                </div>
                <div className="wrap-break-word font-mono text-[10px] text-muted-foreground leading-snug" data-i18n-ignore="">
                  {selectedBinding.shaderLabel || "<no shader>"}
                </div>
              </div>
              <div className="max-h-[min(42vh,360px)] overflow-y-auto overflow-x-hidden px-2 py-2" data-i18n-ignore="">
                <div className="space-y-2 text-[10px]">
                  {TEXTURE_PREVIEW_SLOT_META.map(({ key, short }) => {
                    const pathField = TEXTURE_SLOT_TO_PATH_FIELD[key];
                    const diskPath = selectedBinding.texturePaths[pathField] ?? null;
                    const loadOn = p.textureSlotLoadEnabled[key];
                    const decoded = diskPath ? lookupTextureData(p.textureDataMap, diskPath) : null;
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

      <MayaSection title={t("sections.lighting")} icon={<Layout className="h-3.5 w-3.5" />} defaultOpen={false}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label
              className="text-[11px] text-muted-foreground"
              title={t("help.lightingPreset")}
            >
              {t("labels.lightingPreset")}
            </Label>
            <Select
              value={matchPreviewLightingPreset({
                ambientIntensity: p.ambientIntensity,
                directionalIntensity: p.directionalIntensity,
                directionalX: p.directionalX,
                directionalY: p.directionalY,
                directionalZ: p.directionalZ,
              })}
              onValueChange={(v) => {
                if (v === "custom") return;
                p.applyLightingPreset(v as PreviewLightingPreset);
              }}
            >
              <SelectTrigger className="h-8 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PREVIEW_LIGHTING_PRESET_META.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id} className="text-[11px]" title={t(`lighting.presetHelp.${preset.id}`)}>
                    {t(`lighting.preset.${preset.id}`)}
                  </SelectItem>
                ))}
                <SelectItem value="custom" className="text-[11px]" disabled>
                  {t("lighting.custom")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] text-muted-foreground">{t("labels.ambient")}</Label>
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
              <Label className="text-[11px] text-muted-foreground">{t("labels.directional")}</Label>
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
          <div className={cn("grid gap-2", tripleGridClass)}>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] text-muted-foreground">{t("labels.lightX")}</Label>
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
                <Label className="text-[11px] text-muted-foreground">{t("labels.lightY")}</Label>
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
                <Label className="text-[11px] text-muted-foreground">{t("labels.lightZ")}</Label>
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
            <Label className="text-[11px] text-muted-foreground">{t("labels.backgroundColor")}</Label>
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

      <MayaSection title={t("sections.meshExplorer")} icon={<List className="h-3.5 w-3.5" />}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-[10px] text-muted-foreground">{t("mesh.total", { count: scopedDraws.length })}</span>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[9px] uppercase tracking-tighter"
                onClick={p.showAllMeshes}
              >
                {t("mesh.all")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[9px] uppercase tracking-tighter"
                onClick={p.hideAllMeshes}
              >
                {t("mesh.none")}
              </Button>
            </div>
          </div>
          <div ref={meshListRef} className="h-[300px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-muted">
            <div className="relative w-full" style={{ height: meshVirtualizer.getTotalSize() }}>
              {meshVirtualizer.getVirtualItems().map((virtualRow) => {
                const draw = scopedDraws[virtualRow.index];
                return (
                  <label
                    key={virtualRow.key}
                    className="absolute left-0 top-0 flex w-full cursor-pointer items-start gap-2 rounded-sm p-1 transition-colors hover:bg-muted/30"
                    style={{
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <Checkbox
                      checked={p.visibleKeys.has(draw.key)}
                      onCheckedChange={(checked) => p.toggleVisible(draw.key, checked === true)}
                      className="mt-0.5 h-3.5 w-3.5"
                    />
                    <div className="min-w-0 flex-1 leading-tight" data-i18n-ignore="">
                      <span className="block truncate text-[11px] font-medium">{draw.label}</span>
                      <span className="block truncate text-[9px] text-muted-foreground">
                        {draw.materialLabel}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
            {!scopedDraws.length && (
              <span className="py-4 text-center text-[10px] italic text-muted-foreground">{t("mesh.noMeshes")}</span>
            )}
          </div>
        </div>
      </MayaSection>

      <MayaSection title={t("sections.boneExplorer")} icon={<Bone className="h-3.5 w-3.5" />}>
        <div className="flex flex-col gap-3">
          <p className="text-[9px] leading-snug text-muted-foreground">
            {t("help.boneExplorer")}
          </p>
          {!hasSkinnedMesh && p.selectedBoneIndex !== null && bones.length > 0 ? (
            <p className="text-[10px] text-amber-600/90 dark:text-amber-400/90">
              {t("help.noSkinWeights")}
            </p>
          ) : null}
          {p.previewInstances.length > 1 ? (
            <div className="flex flex-col gap-1.5">
              <Label className="text-[10px] text-muted-foreground">{t("labels.boneListScope")}</Label>
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
                  {t("bones.activeModel")}
                </ToggleGroupItem>
                <ToggleGroupItem value="all" className="h-7 px-2 text-[10px]">
                  {t("bones.allVisible")}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-[10px] text-muted-foreground">{t("labels.jointSize")}</Label>
              <span className="font-mono text-[10px] text-muted-foreground">
                {t("bones.sizeValue", { value: p.bonePointSize.toFixed(1) })}
              </span>
            </div>
            <Slider
              value={[p.bonePointSize]}
              min={0.5}
              max={4}
              step={0.1}
              disabled={bones.length === 0}
              onValueChange={(value) => {
                const next = value[0];
                if (typeof next === "number" && Number.isFinite(next)) {
                  p.setBonePointSize(next);
                }
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[10px] text-muted-foreground">{t("labels.gizmoMode")}</Label>
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
              <ToggleGroupItem value="translate" className="h-8 flex-1 min-w-18 px-2 text-[10px]" aria-label={t("bones.move")}>
                {t("bones.move")}
              </ToggleGroupItem>
              <ToggleGroupItem value="rotate" className="h-8 flex-1 min-w-18 px-2 text-[10px]" aria-label={t("bones.rotate")}>
                {t("bones.rotate")}
              </ToggleGroupItem>
              <ToggleGroupItem value="scale" className="h-8 flex-1 min-w-18 px-2 text-[10px]" aria-label={t("bones.scale")}>
                {t("bones.scale")}
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
            {t("actions.resetBonePose")}
          </Button>
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-[10px] text-muted-foreground">
              {t("bones.count", { count: totalBoneCount })}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[9px] uppercase tracking-tighter"
              disabled={boneListInstances.length === 0}
              onClick={() => p.setSelectedBoneIndex(null)}
            >
              {t("actions.clearSelection")}
            </Button>
          </div>
          <div ref={boneListRef} className="h-[300px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-muted">
            <div className="relative w-full" style={{ height: boneVirtualizer.getTotalSize() }}>
              {boneVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = boneListRows[virtualRow.index];
                const instanceActive = row.instance.id === p.activePreviewInstanceId;
                if (row.kind === "group") {
                  return (
                    <div
                      key={virtualRow.key}
                      className="absolute left-0 top-0 w-full pb-1"
                      style={{
                        height: virtualRow.size,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <div
                        className={cn(
                          "flex h-full items-center gap-1 rounded-sm border px-2 py-1",
                          instanceActive
                            ? "border-primary/55 bg-primary/12 text-foreground"
                            : "border-border/40 text-muted-foreground",
                        )}
                      >
                        <button
                          type="button"
                          className="shrink-0 cursor-pointer hover:text-foreground"
                          title={collapsedBoneGroups.has(row.instance.id) ? t("actions.expandBoneGroup") : t("actions.collapseBoneGroup")}
                          onClick={() =>
                            setCollapsedBoneGroups((prev) => {
                              const next = new Set(prev);
                              if (next.has(row.instance.id)) next.delete(row.instance.id);
                              else next.add(row.instance.id);
                              return next;
                            })
                          }
                        >
                          {collapsedBoneGroups.has(row.instance.id) ? (
                            <ChevronRight className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          className="min-w-0 flex-1 cursor-pointer truncate text-left text-[10px] font-medium hover:text-foreground"
                          onClick={() => {
                            if (row.instance.id === p.activePreviewInstanceId) {
                              p.setActivePreviewInstanceId(null);
                              p.setSelectionOutlineEnabled(false);
                              return;
                            }
                            p.setSelectionOutlineEnabled(true);
                            p.setActivePreviewInstanceId(row.instance.id);
                          }}
                          title={row.instance.modlPath}
                          data-i18n-ignore=""
                        >
                          {row.instance.displayLabel}
                        </button>
                      </div>
                    </div>
                  );
                }

                const active = instanceActive && p.selectedBoneIndex === row.boneIndex;
                return (
                  <button
                    key={virtualRow.key}
                    type="button"
                    className={cn(
                      "absolute left-0 top-0 flex w-full min-w-0 cursor-pointer flex-col rounded-sm border py-1.5 pr-2 text-left transition-colors",
                      active
                        ? "border-primary/55 bg-primary/12"
                        : "border-border/40 hover:bg-muted/35",
                    )}
                    style={{
                      height: virtualRow.size - 4,
                      paddingLeft: `${10 + row.depth * 12}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    onClick={() => {
                      p.setSelectionOutlineEnabled(true);
                      p.setActivePreviewInstanceId(row.instance.id);
                      p.setSelectedBoneIndex(row.boneIndex);
                    }}
                  >
                    <span className="truncate text-[11px] font-medium leading-tight" data-i18n-ignore="">
                      {row.bone.name}
                    </span>
                    <span className="font-mono text-[9px] text-muted-foreground">[{row.boneIndex}]</span>
                  </button>
                );
              })}
            </div>
            {boneListInstances.length === 0 ? (
              <span className="py-4 text-center text-[10px] italic text-muted-foreground">{t("bones.noSkeleton")}</span>
            ) : null}
          </div>
        </div>
      </MayaSection>

      <MayaSection title={t("sections.sceneStats")} icon={<Info className="h-3.5 w-3.5" />} defaultOpen={false}>
        <div className="grid grid-cols-2 gap-x-2 gap-y-3">
          <div className="flex flex-col">
            <span className="text-[9px] uppercase text-muted-foreground">{t("stats.vertices")}</span>
            <span className="text-[11px] font-mono">{p.vertexTriangleStats.verts.toLocaleString()}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] uppercase text-muted-foreground">{t("stats.triangles")}</span>
            <span className="text-[11px] font-mono">{p.vertexTriangleStats.tris.toLocaleString()}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] uppercase text-muted-foreground">{t("stats.drawCalls")}</span>
            <span className="text-[11px] font-mono">{p.draws.length}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] uppercase text-muted-foreground">{t("stats.textures")}</span>
            <span className="text-[11px] font-mono">{p.textureDataMap.size}</span>
          </div>
          <div className="flex flex-col col-span-2">
            <span className="text-[9px] uppercase text-muted-foreground">{t("stats.bones")}</span>
            <span className="text-[11px] font-mono">
              {p.bundle?.skel ? (p.bundle.skel as SkelDataJson).bones?.length ?? 0 : "—"}
            </span>
          </div>
        </div>
      </MayaSection>

      {activeBundle ? (
        <MayaSection title={t("sections.bundleDebug")} icon={<Info className="h-3.5 w-3.5" />} defaultOpen={false}>
          <div className="flex flex-col gap-3 text-[10px]">
            <div className="space-y-1">
              <div className="text-[9px] uppercase text-muted-foreground">{t("bundle.active")}</div>
              <div className="font-mono wrap-anywhere" data-i18n-ignore="">{activeBundle.modlPath}</div>
              <div className="font-mono wrap-anywhere text-muted-foreground" data-i18n-ignore="">{activeBundle.meshPath}</div>
            </div>

            <div className="grid grid-cols-2 gap-x-2 gap-y-2">
              <div className="flex flex-col">
                <span className="text-[9px] uppercase text-muted-foreground">{t("bundle.matlFiles")}</span>
                <span className="font-mono">{activeBundle.matlPaths.length}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] uppercase text-muted-foreground">{t("bundle.matlEntries")}</span>
                <span className="font-mono">{activeMatlLookup.size}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] uppercase text-muted-foreground">{t("bundle.textureRefs")}</span>
                <span className="font-mono">{activeBundle.textureRefs.length}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] uppercase text-muted-foreground">{t("bundle.resolvedNutexb")}</span>
                <span className="font-mono">{activeBundle.resolvedNutexbPaths.length}</span>
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-[9px] uppercase text-muted-foreground">{t("bundle.matlPathList")}</div>
              <div className="max-h-[96px] space-y-1 overflow-y-auto pr-1" data-i18n-ignore="">
                {activeBundle.matlPaths.length > 0 ? (
                  activeBundle.matlPaths.map((path) => (
                    <div key={path} className="font-mono wrap-anywhere text-muted-foreground">
                      {path}
                    </div>
                  ))
                ) : (
                  <div className="italic text-muted-foreground">{t("bundle.noMatl")}</div>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-[9px] uppercase text-muted-foreground">
                {t("bundle.missingDrawLabels", { count: missingMaterialLabelRows.length })}
              </div>
              <div className="max-h-[96px] space-y-1 overflow-y-auto pr-1" data-i18n-ignore="">
                {missingMaterialLabelRows.length > 0 ? (
                  missingMaterialLabelRows.map((row) => (
                    <div key={row} className="font-mono wrap-anywhere text-amber-700/90 dark:text-amber-400/90">
                      {row}
                    </div>
                  ))
                ) : (
                  <div className="italic text-muted-foreground">{t("bundle.allDrawLabels")}</div>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-[9px] uppercase text-muted-foreground">
                {t("bundle.unresolvedTextureRefs", {
                  unresolved: unresolvedTextureResolveRows.length,
                  total: activeTextureResolveRows.length,
                })}
              </div>
              <div className="max-h-[132px] space-y-1 overflow-y-auto pr-1" data-i18n-ignore="">
                {unresolvedTextureResolveRows.length > 0 ? (
                  unresolvedTextureResolveRows.slice(0, 120).map((row) => (
                    <div key={row.reference} className="font-mono wrap-anywhere text-amber-700/90 dark:text-amber-400/90">
                      {row.reference}
                    </div>
                  ))
                ) : (
                  <div className="italic text-muted-foreground">{t("bundle.allTexturesResolved")}</div>
                )}
              </div>
            </div>
          </div>
        </MayaSection>
      ) : null}

      {p.bundle?.warnings?.length ? (
        <MayaSection title={t("sections.warnings")} icon={<Info className="h-3.5 w-3.5 text-amber-500" />}>
          <div className="min-w-0 max-w-full">
            <ul className="list-disc space-y-1.5 pl-4 text-[10px] text-muted-foreground" data-i18n-ignore="">
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
