import {
  Activity,
  Box,
  CopyPlus,
  CornerDownRight,
  Eye,
  EyeOff,
  ImageIcon,
  Layers3,
  Redo2,
  RotateCcw,
  Save,
  Trash2,
  Undo2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import type {
  EffectFolderInventory,
  EfxbnEffectSummary,
} from "@/services/effectFolder/effectFolderService";
import { EFFECT_FOLDER_COMMON_PACK_NAME } from "@/services/effectFolder/effectFolderCommonPack";
import {
  evaluateEfxbnControl,
  type EffectFolderPreviewPlan,
  type EffectFolderResourceSource,
  type EfxbnTextureSlot,
} from "./effectFolderPreviewPlan";
import { EfxbnColorAuthor } from "./EfxbnColorAuthor";
import {
  EFXBN_BLEND_STATE_LABELS,
  EFXBN_CULLING_TYPE_LABELS,
} from "./EfxbnParticlePreview";
import {
  efxbnParticleSortsFrontToBack,
  efxbnRequiresParticleDepthSort,
  resolveEfxbnCameraFadeRange,
  resolveEfxbnViewAngleRamp,
} from "./efxbnBillboardShading";
import {
  addEfxbnBlock,
  canRedoEfxbn,
  canUndoEfxbn,
  deleteEfxbnBlock,
  EFXBN_COLOR_CONTROL_NAMES,
  efxbnDirtyBlockIndexes,
  isEfxbnDocumentDirty,
  reparentEfxbnBlock,
  type EfxbnColorControlName,
  type EfxbnControlName,
  type EfxbnDocument,
} from "./efxbnDocument";
import { EfxbnBlockEditor } from "./EfxbnBlockEditor";
import {
  efxbnChildIndexes,
  findEfxbnParentBlocks,
  isEfxbnEmitterBlock,
  EFXBN_ELEMENT_TYPE,
  efxbnRuntime,
  resolveEfxbnShaderVariants,
} from "./efxbnSimulation";

/** Slot roles as the shader consumes them, so the panel does not read as four identical maps. */
const EFXBN_TEXTURE_SLOT_KEYS: Record<EfxbnTextureSlot, string> = {
  color0: "textureSlots.color0",
  color1: "textureSlots.color1",
  uv0: "textureSlots.uv0",
  uv1: "textureSlots.uv1",
};

export type EfxbnPreviewInspectorPane = "all" | "outliner" | "properties";

type EfxbnPreviewInspectorProps = {
  plan: EffectFolderPreviewPlan;
  progress: number;
  selectedEffectIndex: number | null;
  hiddenEffectIndexes: ReadonlySet<number>;
  onSelectEffect: (effectIndex: number) => void;
  onSetEffectVisible: (effectIndex: number, visible: boolean) => void;
  onShowAll: () => void;
  onSolo: (effectIndex: number) => void;
  /** Split the block tree from the property editor so they do not share one cramped column. */
  pane?: EfxbnPreviewInspectorPane;
  document?: EfxbnDocument | null;
  inventory?: EffectFolderInventory | null;
  /** Playback window, so an inserted keyframe defaults inside the effect. */
  frameCount?: number;
  writing?: boolean;
  focusedControlName?: EfxbnControlName;
  onFocusedControlNameChange?: (name: EfxbnControlName) => void;
  onDocumentChange?: (next: EfxbnDocument) => void;
  onEditorError?: (message: string) => void;
  onRevert?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onWrite?: () => void;
};

function typeName(block: EfxbnEffectSummary, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (block.effectType === EFXBN_ELEMENT_TYPE.billboard) return t("types.billboard");
  if (block.effectType === EFXBN_ELEMENT_TYPE.model) return t("types.model");
  if (block.effectType === EFXBN_ELEMENT_TYPE.strip) return t("types.strip");
  if (block.effectType === 9) {
    return block.spawnFormType === 9 || block.spawnFormType === 10
      ? t("types.meshEmitterWrapper")
      : t("types.wrapper");
  }
  // Types 6, 8, 10 and 11 are structural containers with no proven authoring name.
  return t("types.container", { type: block.effectType });
}

/** Short enough for a badge in a narrow inspector; the full pack name goes in the tooltip. */
function resourceSourceLabel(source: EffectFolderResourceSource, t: (key: string) => string): string {
  return source === "pack" ? t("sources.pack") : t("sources.common");
}

function resourceSourceTitle(source: EffectFolderResourceSource | null, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (source === null) return t("sources.neither");
  return source === "pack"
    ? t("sources.resolvedPack")
    : t("sources.resolvedCommon", { pack: EFFECT_FOLDER_COMMON_PACK_NAME });
}

/** The block that lists `index` as a child, or null when it is a root. */
function parentIndexOf(blocks: readonly EfxbnEffectSummary[], index: number): number | null {
  return findEfxbnParentBlocks(blocks, index)[0]?.index ?? null;
}

function InspectorRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/45 py-2 last:border-b-0">
      <span className="shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 break-all text-right text-[11px]", mono && "font-mono tabular-nums")}>{value}</span>
    </div>
  );
}

export function EfxbnPreviewInspector({
  plan,
  progress,
  selectedEffectIndex,
  hiddenEffectIndexes,
  onSelectEffect,
  onSetEffectVisible,
  onShowAll,
  onSolo,
  pane = "all",
  document: doc = null,
  inventory = null,
  frameCount = 120,
  writing = false,
  focusedControlName = "colorR",
  onFocusedControlNameChange,
  onDocumentChange,
  onEditorError,
  onRevert,
  onUndo,
  onRedo,
  onWrite,
}: EfxbnPreviewInspectorProps) {
  const { t } = useTranslation("test-efxbn-preview");
  const selectedBlock =
    plan.effectBlocks.find((block) => block.index === selectedEffectIndex) ?? plan.effectBlocks[0] ?? null;
  const activeControls =
    selectedBlock?.controlReferences.filter((reference) => reference.selector !== 0) ?? [];
  const textureBindings = selectedBlock
    ? plan.textureBindings.filter((binding) => binding.effectIndex === selectedBlock.index)
    : [];
  // MultiUV needs the model mesh, which this panel does not load, so it stays out.
  const shaderVariants = selectedBlock ? resolveEfxbnShaderVariants(selectedBlock) : [];
  const drawSchemeFlag = selectedBlock ? efxbnRuntime(selectedBlock).drawScheme.flag : 0;
  // Named where the enum is proven from the engine's own D3D11 translation tables; raw
  // otherwise, so an unmapped value is visible as unmapped rather than mislabelled.
  const blendStateLabel = selectedBlock
    ? EFXBN_BLEND_STATE_LABELS[selectedBlock.blendState] ?? `${selectedBlock.blendState} (unmapped)`
    : "";
  const cullingTypeLabel = selectedBlock
    ? EFXBN_CULLING_TYPE_LABELS[selectedBlock.cullingType] ?? `${selectedBlock.cullingType} (unmapped)`
    : "";
  const drawOrderLabel = selectedBlock
    ? efxbnRequiresParticleDepthSort(selectedBlock)
      ? efxbnParticleSortsFrontToBack(selectedBlock)
      ? t("values.sortedFrontToBack")
        : t("values.sortedBackToFront")
      : t("values.unsorted")
    : "";
  const viewAngleRamp = selectedBlock ? resolveEfxbnViewAngleRamp(selectedBlock) : null;
  const viewAngleRampLabel = !selectedBlock
    ? ""
    : viewAngleRamp === null
      ? t("values.off")
      : `a ${viewAngleRamp.startColor[3].toFixed(2)} → ${viewAngleRamp.endColor[3].toFixed(2)} · pow ${viewAngleRamp.power.toFixed(2)}`;
  const cameraFadeRange = selectedBlock ? resolveEfxbnCameraFadeRange(selectedBlock) : null;
  const cameraFadeLabel = !selectedBlock
    ? ""
    : cameraFadeRange === null
      ? t("values.off")
      : t("values.units", { value: cameraFadeRange.toFixed(2) });
  // Most blocks bind a model that only exists in the shared pack, so the ID alone does not say
  // whether the preview found it — the resolved source does.
  const modelTarget = selectedBlock
    ? plan.targets.find((target) => target.effectIndex === selectedBlock.index) ?? null
    : null;
  const modelLabel = !selectedBlock
    ? ""
    : selectedBlock.modelHash.signed === 0
      ? t("values.none")
      : `${selectedBlock.modelHash.hex} · ${modelTarget ? resourceSourceLabel(modelTarget.source, t) : t("values.unresolved")}`;
  const draftDirty = doc ? isEfxbnDocumentDirty(doc) : false;
  const dirtyBlocks = doc ? efxbnDirtyBlockIndexes(doc) : new Set<number>();
  const dirtyCount = dirtyBlocks.size;
  const liveAuthor = Boolean(doc && onDocumentChange && onEditorError);
  const canEdit = Boolean(doc && inventory && onDocumentChange && onEditorError);
  const showOutliner = pane !== "properties";
  const showProperties = pane !== "outliner";
  const asideLabel =
    pane === "outliner" ? t("aria.outliner") : pane === "properties" ? t("aria.properties") : t("aria.liveAuthor");

  const runCommand = (run: (current: EfxbnDocument) => EfxbnDocument) => {
    if (!doc || !onDocumentChange) return;
    try {
      onDocumentChange(run(doc));
    } catch (error) {
      onEditorError?.(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-col overflow-hidden",
        pane === "outliner" ? "bg-muted/15" : "bg-background",
      )}
      aria-label={asideLabel}
    >
      {showOutliner ? (
      <>
      <div className="shrink-0 border-b px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <Layers3 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 truncate text-xs font-medium">{t("labels.blocks")}</span>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {plan.effectBlocks.length}
          </span>
          {liveAuthor ? (
            <Badge
              variant="outline"
              className={cn(
                "ml-auto h-5 shrink-0 px-1.5 text-[10px]",
                draftDirty
                  ? "border-amber-500/40 text-amber-400"
                  : "border-emerald-500/35 text-emerald-400",
              )}
            >
              {draftDirty ? t("status.unsaved", { count: dirtyCount }) : t("status.liveDraft")}
            </Badge>
          ) : null}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            onClick={onShowAll}
            title={t("buttons.showAllTitle")}
            aria-label={t("buttons.showAllAria")}
          >
            <Eye className="h-4 w-4" />
          </Button>
          {selectedBlock ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 shrink-0 px-2 text-[11px]"
              onClick={() => onSolo(selectedBlock.index)}
              title={t("buttons.soloTitle")}
            >
              {t("buttons.solo")}
            </Button>
          ) : null}
          {canEdit && selectedBlock ? (
            <>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                disabled={writing}
                onClick={() =>
                  runCommand((current) =>
                    addEfxbnBlock(
                      current,
                      selectedBlock.index,
                      parentIndexOf(plan.effectBlocks, selectedBlock.index),
                      selectedBlock.effectType,
                    ),
                  )
                }
                title={t("buttons.duplicateTitle")}
                aria-label={t("buttons.duplicateAria")}
              >
                <CopyPlus className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0 text-destructive"
                disabled={writing || plan.effectBlocks.length <= 1}
                onClick={() => runCommand((current) => deleteEfxbnBlock(current, selectedBlock.index))}
                title={t("buttons.deleteTitle")}
                aria-label={t("buttons.deleteAria")}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div
        className={cn(
          "custom-scrollbar-thin min-h-0 overflow-y-auto p-1.5",
          showProperties ? "max-h-[42%] shrink-0 border-b" : "flex-1",
        )}
        onDragOver={(event) => {
          if (canEdit && event.dataTransfer.types.includes("text/efxbn-block")) event.preventDefault();
        }}
        onDrop={(event) => {
          if (!canEdit) return;
          const moved = Number(event.dataTransfer.getData("text/efxbn-block"));
          if (!Number.isInteger(moved)) return;
          event.preventDefault();
          runCommand((current) => reparentEfxbnBlock(current, moved, null));
        }}
      >
        {plan.effectBlocks.map((block) => {
          const selected = block.index === selectedBlock?.index;
          const visible = !hiddenEffectIndexes.has(block.index);
          const target = plan.targets.find((candidate) => candidate.effectIndex === block.index);
          const blockTextures = plan.textureBindings.filter((binding) => binding.effectIndex === block.index);
          const linkedFrom = findEfxbnParentBlocks(plan.effectBlocks, block.index)[0];
          const blockDirty = dirtyBlocks.has(block.index);
          return (
            <div
              key={block.index}
              className={cn(
                "group flex min-h-10 items-center gap-1.5 border-l-2 px-1.5",
                selected ? "border-l-amber-500/80 bg-amber-500/10" : "border-l-transparent hover:bg-muted/60",
              )}
            >
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0 text-muted-foreground"
                onClick={() => onSetEffectVisible(block.index, !visible)}
                title={visible ? t("buttons.hideBlock") : t("buttons.showBlock")}
                aria-label={t(visible ? "buttons.hideBlockAria" : "buttons.showBlockAria", { index: block.index })}
              >
                {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </Button>
              {canEdit ? (
                <div
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/efxbn-block", String(block.index));
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(event) => {
                    if (event.dataTransfer.types.includes("text/efxbn-block")) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const moved = Number(event.dataTransfer.getData("text/efxbn-block"));
                    if (!Number.isInteger(moved) || moved === block.index) return;
                    runCommand((current) => reparentEfxbnBlock(current, moved, block.index));
                  }}
                  className="h-7 w-2 shrink-0 cursor-grab rounded-sm bg-border/60 active:cursor-grabbing"
                  title={t("buttons.dragTitle")}
                  aria-hidden
                />
              ) : null}
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onClick={() => onSelectEffect(block.index)}
                aria-pressed={selected}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border bg-background">
                  {linkedFrom ? (
                    <CornerDownRight className="h-3 w-3" />
                  ) : target ? (
                    <Box className="h-3 w-3" />
                  ) : (
                    <Activity className="h-3 w-3" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 truncate text-[11px] font-medium">
                {t("labels.block", { index: String(block.index).padStart(2, "0") })}
                    {blockDirty ? (
                      <span
                        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
                        title={t("status.unsavedEdits")}
                        aria-label={t("status.unsavedEdits")}
                      />
                    ) : null}
                  </span>
                  <span className="block truncate text-[10px] text-muted-foreground">{typeName(block, t)}</span>
                </span>
                {target?.animationPath ? <span className="text-[9px] text-muted-foreground" data-i18n-ignore="">A</span> : null}
                {blockTextures.some((binding) => binding.file) ? (
                  <ImageIcon className="h-3 w-3 shrink-0 text-muted-foreground" aria-label={t("labels.localTexture")} />
                ) : null}
              </button>
            </div>
          );
        })}
      </div>
      </>
      ) : null}

      {showProperties && selectedBlock ? (
        <Tabs
          defaultValue={canEdit ? "edit" : liveAuthor ? "color" : "block"}
          className="flex min-h-0 flex-1 flex-col px-3 py-2"
        >
          {pane === "properties" ? (
            <div className="mb-2 flex min-w-0 items-baseline gap-2">
              <span className="truncate text-xs font-medium">
                {t("labels.block", { index: String(selectedBlock.index).padStart(2, "0") })}
              </span>
              <span className="truncate text-[11px] text-muted-foreground">{typeName(selectedBlock, t)}</span>
            </div>
          ) : null}
          <TabsList className="flex h-8 w-full shrink-0 justify-start gap-0.5 overflow-x-auto rounded-md p-0.5" aria-label={t("labels.tabs")}>
            {canEdit ? (
              <TabsTrigger value="edit" className="h-7 shrink-0 rounded px-2.5 text-[11px]">{t("tabs.edit")}</TabsTrigger>
            ) : null}
            {liveAuthor ? (
              <TabsTrigger value="color" className="h-7 shrink-0 rounded px-2.5 text-[11px]">{t("tabs.color")}</TabsTrigger>
            ) : null}
            <TabsTrigger value="block" className="h-7 shrink-0 rounded px-2.5 text-[11px]">{t("tabs.block")}</TabsTrigger>
            <TabsTrigger value="controls" className="h-7 shrink-0 rounded px-2.5 text-[11px]">{t("tabs.controls")}</TabsTrigger>
            <TabsTrigger value="material" className="h-7 shrink-0 rounded px-2.5 text-[11px]">{t("tabs.material")}</TabsTrigger>
          </TabsList>

          {canEdit && doc && inventory && onDocumentChange && onEditorError ? (
            <TabsContent value="edit" className="custom-scrollbar-thin mt-2 min-h-0 flex-1 overflow-y-auto">
              <EfxbnBlockEditor
                document={doc}
                blockIndex={selectedBlock.index}
                inventory={inventory}
                frameCount={frameCount}
                progress={progress}
                focusedControlName={focusedControlName}
                onFocusedControlNameChange={onFocusedControlNameChange ?? (() => undefined)}
                disabled={writing}
                onChange={onDocumentChange}
                onError={onEditorError}
              />
            </TabsContent>
          ) : null}

          {liveAuthor && doc && onDocumentChange && onEditorError ? (
            <TabsContent value="color" className="custom-scrollbar-thin mt-2 min-h-0 flex-1 overflow-y-auto">
              <EfxbnColorAuthor
                document={doc}
                block={selectedBlock}
                progress={progress}
                frameCount={frameCount}
                writing={writing}
                focusedControlName={
                  EFXBN_COLOR_CONTROL_NAMES.includes(focusedControlName as EfxbnColorControlName)
                    ? (focusedControlName as EfxbnColorControlName)
                    : "colorR"
                }
                onFocusedControlNameChange={onFocusedControlNameChange ?? (() => undefined)}
                onDocumentChange={onDocumentChange}
                onError={onEditorError}
              />
            </TabsContent>
          ) : null}

          <TabsContent value="block" className="custom-scrollbar-thin mt-2 min-h-0 flex-1 overflow-y-auto">
            <InspectorRow label={t("fields.index")} value={String(selectedBlock.index)} />
            <InspectorRow label={t("fields.runtimeType")} value={`${selectedBlock.effectType} (${typeName(selectedBlock, t)})`} />
            <InspectorRow label={t("fields.treeLevel")} value={String(selectedBlock.level)} />
            {isEfxbnEmitterBlock(selectedBlock) ? (
              <InspectorRow
                label={t("fields.childBlocks")}
                value={efxbnChildIndexes(selectedBlock).join(", ")}
              />
            ) : null}
            <InspectorRow
              label={t("fields.lifetime")}
              value={`${selectedBlock.lifeTimeBase.toFixed(3)} ± ${(selectedBlock.lifeTimeRandom * 100).toFixed(1)}%`}
            />
            <InspectorRow
              label={t("fields.emit")}
              value={`${selectedBlock.numEmit} / ${selectedBlock.intervalBase.toFixed(3)}f`}
            />
            <InspectorRow label={t("fields.delay")} value={`${selectedBlock.delayEmitTimeBase.toFixed(3)}f`} />
            <InspectorRow label={t("fields.spawnForm")} value={String(selectedBlock.spawnFormType)} />
            <InspectorRow
              label={t("fields.actionFlags")}
              value={`0x${selectedBlock.actionFlags.toString(16).toUpperCase().padStart(8, "0")}`}
            />
            <InspectorRow
              label={t("fields.depthBlend")}
              value={`Z${selectedBlock.zTestEnable ? "T" : "-"}${efxbnRuntime(selectedBlock).zWriteEnable ? "W" : "-"} · ${blendStateLabel}`}
            />
            <InspectorRow label={t("fields.culling")} value={cullingTypeLabel} />
            <InspectorRow label={t("fields.drawOrder")} value={drawOrderLabel} />
            <InspectorRow label={t("fields.viewAngleRamp")} value={viewAngleRampLabel} />
            <InspectorRow label={t("fields.cameraFade")} value={cameraFadeLabel} />
            <InspectorRow label={t("fields.model")} value={modelLabel} />
            <InspectorRow label={t("fields.animation")} value={selectedBlock.animationHash.signed === 0 ? t("values.none") : selectedBlock.animationHash.hex} />
          </TabsContent>

          <TabsContent value="controls" className="custom-scrollbar-thin mt-2 min-h-0 flex-1 overflow-y-auto">
            {activeControls.length > 0 ? (
              activeControls.map((reference) => (
                <div key={reference.index} className="flex items-center gap-2 overflow-hidden border-b border-border/45 py-1.5 last:border-b-0">
                  <span className="w-12 shrink-0 truncate font-mono text-[9px]">{reference.name}</span>
                  <Badge variant="outline" className="h-4 shrink-0 px-1 text-[8px]">
                    {reference.selector === 1 ? "direct" : `${reference.selector} keys`}
                  </Badge>
                  <span className="ml-auto shrink-0 font-mono text-[9px] tabular-nums">
                    {evaluateEfxbnControl(reference, plan.controlLookupEntries, progress).toFixed(4)}
                  </span>
                </div>
              ))
            ) : (
              <p className="py-2 text-[10px] text-muted-foreground">{t("empty.noActiveControls")}</p>
            )}
          </TabsContent>

          <TabsContent value="material" className="custom-scrollbar-thin mt-2 min-h-0 flex-1 overflow-y-auto">
            <div className="border-b border-border/45 py-1.5">
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="min-w-0 truncate text-[9px] font-medium">{t("labels.shaderVariants")}</span>
                <span
                  className="ml-auto shrink-0 font-mono text-[9px] text-muted-foreground"
                  title={t("help.drawSchemeFlag")}
                  data-i18n-ignore=""
                >
                  0x{drawSchemeFlag.toString(16).toUpperCase()}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {shaderVariants.length > 0 ? (
                  shaderVariants.map((variant) => (
                    <Badge key={variant} variant="secondary" className="h-4 px-1 text-[8px]">
                      {variant}
                    </Badge>
                  ))
                ) : (
                  <span className="text-[9px] text-muted-foreground">{t("values.baseOnly")}</span>
                )}
              </div>
              {shaderVariants.length > 0 ? (
                <p className="mt-1 text-[9px] text-amber-600 dark:text-amber-400">
                  {t("help.baseShaderOnly")}
                </p>
              ) : null}
            </div>
            {textureBindings.length > 0 ? (
              textureBindings.map((binding, index) => (
                <div
                  key={`${binding.slot}-${binding.controlIndex}-${index}`}
                  className="border-b border-border/45 py-1.5 last:border-b-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 truncate text-[9px] font-medium">
                      {t(EFXBN_TEXTURE_SLOT_KEYS[binding.slot])}
                    </span>
                    <span className="shrink-0 font-mono text-[9px] text-muted-foreground">
                      #{binding.controlIndex}
                    </span>
                    <Badge
                      variant={binding.source ? "outline" : "secondary"}
                      className="ml-auto h-4 shrink-0 px-1 text-[8px]"
                  title={resourceSourceTitle(binding.source, t)}
                    >
                      {binding.source ? resourceSourceLabel(binding.source, t) : t("values.missing")}
                    </Badge>
                  </div>
                  <div className="mt-1 truncate font-mono text-[9px] text-muted-foreground" title={binding.file?.path}>
                    {binding.parameter.colorMapHash.hex}
                  </div>
                  <div className="mt-1 flex gap-2 text-[9px] text-muted-foreground" data-i18n-ignore="">
                    <span>UV {binding.parameter.uvPatternType}</span>
                    <span>flags 0x{binding.parameter.textureSettingFlags.toString(16).toUpperCase()}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="py-2 text-[10px] text-muted-foreground">{t("empty.noTextureSlots")}</p>
            )}
          </TabsContent>
        </Tabs>
      ) : null}

      {showProperties && liveAuthor ? (
        <footer
          className={cn(
            "shrink-0 border-t px-3 py-2.5",
            draftDirty
              ? "border-amber-500/25 bg-amber-500/[0.06]"
              : "border-border/60 bg-muted/15",
          )}
          aria-label={t("aria.documentActions")}
        >
          <div className="mb-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="truncate text-[10px] font-medium text-muted-foreground">{t("labels.efxbnFile")}</span>
            {draftDirty ? (
              <Badge
                variant="outline"
                className="h-4 shrink-0 border-amber-500/40 px-1.5 text-[8px] text-amber-400"
              >
                {t("status.unsaved", { count: dirtyCount })}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="h-4 shrink-0 border-emerald-500/30 px-1.5 text-[8px] text-emerald-400"
              >
                {t("status.clean")}
              </Badge>
            )}
            {writing ? (
              <Badge variant="outline" className="h-4 shrink-0 px-1.5 text-[8px] text-muted-foreground">
                {t("status.writing")}
              </Badge>
            ) : null}
          </div>
          <p
            className="mb-2 truncate font-mono text-[9px] text-muted-foreground"
            title={doc?.path}
          >
            {doc?.path || t("values.noDocument")}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {onUndo ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                disabled={!doc || !canUndoEfxbn(doc) || writing}
                onClick={onUndo}
                title={doc && canUndoEfxbn(doc) ? t("buttons.undoTitle", { change: doc.changeLog.at(-1) ?? "" }) : t("buttons.nothingToUndo")}
              >
                <Undo2 className="h-3.5 w-3.5" />
              </Button>
            ) : null}
            {onRedo ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                disabled={!doc || !canRedoEfxbn(doc) || writing}
                onClick={onRedo}
                title={t("buttons.redoTitle")}
              >
                <Redo2 className="h-3.5 w-3.5" />
              </Button>
            ) : null}
            {onRevert ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 shrink-0 gap-1.5 px-2.5 text-[11px]"
                disabled={!draftDirty || writing}
                onClick={onRevert}
                title={t("buttons.resetTitle")}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t("buttons.reset")}
              </Button>
            ) : null}
            {onWrite ? (
              <Button
                type="button"
                size="sm"
                className={cn(
                  "ml-auto h-8 shrink-0 gap-1.5 px-3 text-[11px]",
                  draftDirty && "bg-amber-600 text-white hover:bg-amber-500",
                )}
                disabled={!draftDirty || writing}
                onClick={onWrite}
                title={
                  doc?.path
                    ? t("buttons.rewriteTitle", { path: doc.path })
                    : t("buttons.rewriteDefaultTitle")
                }
              >
                <Save className="h-3.5 w-3.5" />
                {writing ? t("status.writing") : draftDirty ? t("buttons.saveDirty", { count: dirtyCount }) : t("buttons.save")}
              </Button>
            ) : null}
          </div>
        </footer>
      ) : null}
    </aside>
  );
}
