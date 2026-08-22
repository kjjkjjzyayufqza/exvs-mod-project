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
  efxbnDirtyBlockIndexes,
  isEfxbnDocumentDirty,
  reparentEfxbnBlock,
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
const EFXBN_TEXTURE_SLOT_LABELS: Record<EfxbnTextureSlot, string> = {
  color0: "Colour map",
  color1: "Pass-2 colour",
  uv0: "UV offset",
  uv1: "Pass-2 UV offset",
};

type EfxbnPreviewInspectorProps = {
  plan: EffectFolderPreviewPlan;
  progress: number;
  selectedEffectIndex: number | null;
  hiddenEffectIndexes: ReadonlySet<number>;
  onSelectEffect: (effectIndex: number) => void;
  onSetEffectVisible: (effectIndex: number, visible: boolean) => void;
  onShowAll: () => void;
  onSolo: (effectIndex: number) => void;
  document?: EfxbnDocument | null;
  inventory?: EffectFolderInventory | null;
  /** Playback window, so an inserted keyframe defaults inside the effect. */
  frameCount?: number;
  writing?: boolean;
  onDocumentChange?: (next: EfxbnDocument) => void;
  onEditorError?: (message: string) => void;
  onPatchColor?: (
    blockIndex: number,
    color: { r?: number; g?: number; b?: number; a?: number },
  ) => void;
  onRevert?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onWrite?: () => void;
};

function typeName(block: EfxbnEffectSummary): string {
  if (block.effectType === EFXBN_ELEMENT_TYPE.billboard) return "Billboard";
  if (block.effectType === EFXBN_ELEMENT_TYPE.model) return "Model";
  if (block.effectType === EFXBN_ELEMENT_TYPE.strip) return "Strip";
  if (block.effectType === 9) {
    return block.spawnFormType === 9 || block.spawnFormType === 10
      ? "Mesh emitter wrapper"
      : "Wrapper";
  }
  // Types 6, 8, 10 and 11 are structural containers with no proven authoring name.
  return `Container ${block.effectType}`;
}

/** Short enough for a badge in a narrow inspector; the full pack name goes in the tooltip. */
function resourceSourceLabel(source: EffectFolderResourceSource): string {
  return source === "pack" ? "pack" : "common";
}

function resourceSourceTitle(source: EffectFolderResourceSource | null): string {
  if (source === null) return "Present in neither this pack nor the shared pack";
  return source === "pack"
    ? "Resolved in the pack being edited"
    : `Resolved in the shared pack ${EFFECT_FOLDER_COMMON_PACK_NAME}`;
}

/** The block that lists `index` as a child, or null when it is a root. */
function parentIndexOf(blocks: readonly EfxbnEffectSummary[], index: number): number | null {
  return findEfxbnParentBlocks(blocks, index)[0]?.index ?? null;
}

function InspectorRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2 border-b border-border/45 py-1.5 last:border-b-0">
      <span className="shrink-0 text-[10px] text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 break-all text-right text-[10px]", mono && "font-mono tabular-nums")}>{value}</span>
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
  document: doc = null,
  inventory = null,
  frameCount = 120,
  writing = false,
  onDocumentChange,
  onEditorError,
  onPatchColor,
  onRevert,
  onUndo,
  onRedo,
  onWrite,
}: EfxbnPreviewInspectorProps) {
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
        ? "sorted front to back"
        : "sorted back to front"
      : "unsorted (order-independent)"
    : "";
  const viewAngleRamp = selectedBlock ? resolveEfxbnViewAngleRamp(selectedBlock) : null;
  const viewAngleRampLabel = !selectedBlock
    ? ""
    : viewAngleRamp === null
      ? "off"
      : `a ${viewAngleRamp.startColor[3].toFixed(2)} → ${viewAngleRamp.endColor[3].toFixed(2)} · pow ${viewAngleRamp.power.toFixed(2)}`;
  const cameraFadeRange = selectedBlock ? resolveEfxbnCameraFadeRange(selectedBlock) : null;
  const cameraFadeLabel = !selectedBlock
    ? ""
    : cameraFadeRange === null
      ? "off"
      : `${cameraFadeRange.toFixed(2)} units`;
  // Most blocks bind a model that only exists in the shared pack, so the ID alone does not say
  // whether the preview found it — the resolved source does.
  const modelTarget = selectedBlock
    ? plan.targets.find((target) => target.effectIndex === selectedBlock.index) ?? null
    : null;
  const modelLabel = !selectedBlock
    ? ""
    : selectedBlock.modelHash.signed === 0
      ? "none"
      : `${selectedBlock.modelHash.hex} · ${modelTarget ? resourceSourceLabel(modelTarget.source) : "unresolved"}`;
  const draftDirty = doc ? isEfxbnDocumentDirty(doc) : false;
  const dirtyBlocks = doc ? efxbnDirtyBlockIndexes(doc) : new Set<number>();
  const dirtyCount = dirtyBlocks.size;
  const liveAuthor = Boolean(doc && onPatchColor);
  const canEdit = Boolean(doc && inventory && onDocumentChange && onEditorError);

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
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-muted/10"
      aria-label="EFXBN live author"
    >
      <div className="flex h-9 shrink-0 items-center gap-1 overflow-hidden border-b px-2">
        <Layers3 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 truncate text-[11px] font-medium">
          {liveAuthor ? "Live author" : "Blocks"}
        </span>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
          {plan.effectBlocks.length}
        </span>
        {liveAuthor ? (
          <Badge
            variant="outline"
            className={cn(
              "ml-1 h-4 shrink-0 px-1.5 text-[8px]",
              draftDirty
                ? "border-amber-500/40 text-amber-400"
                : "border-emerald-500/35 text-emerald-400",
            )}
          >
            {draftDirty ? `${dirtyCount} unsaved` : "live draft"}
          </Badge>
        ) : null}
        <div className="min-w-0 flex-1" />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-6 w-6 shrink-0"
          onClick={onShowAll}
          title="Show all blocks"
          aria-label="Show all EFXBN blocks"
        >
          <Eye className="h-3.5 w-3.5" />
        </Button>
        {selectedBlock ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 shrink-0 px-1.5 text-[10px]"
            onClick={() => onSolo(selectedBlock.index)}
            title="Hide every block except the selected block"
          >
            Solo
          </Button>
        ) : null}
        {canEdit && selectedBlock ? (
          <>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-6 w-6 shrink-0"
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
              title="Duplicate the selected block under the same parent, with its own curve keys"
              aria-label="Duplicate the selected EFXBN block"
            >
              <CopyPlus className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-6 w-6 shrink-0 text-destructive"
              disabled={writing || plan.effectBlocks.length <= 1}
              onClick={() => runCommand((current) => deleteEfxbnBlock(current, selectedBlock.index))}
              title="Delete the selected block and renumber every index that pointed past it"
              aria-label="Delete the selected EFXBN block"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : null}
      </div>

      <div
        className="custom-scrollbar-thin max-h-[42%] shrink-0 overflow-y-auto border-b p-1"
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
                "group flex min-h-9 items-center gap-1 border-l-2 px-1",
                selected ? "border-l-amber-500/80 bg-amber-500/10" : "border-l-transparent hover:bg-muted/60",
              )}
            >
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0 text-muted-foreground"
                onClick={() => onSetEffectVisible(block.index, !visible)}
                title={visible ? "Hide block" : "Show block"}
                aria-label={`${visible ? "Hide" : "Show"} EFXBN block ${block.index}`}
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
                  title="Drag onto another block to reparent it, or onto the header strip to make it a root"
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
                  <span className="flex items-center gap-1.5 truncate text-[10px] font-medium">
                    Block {String(block.index).padStart(2, "0")}
                    {blockDirty ? (
                      <span
                        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
                        title="Unsaved edits"
                        aria-label="Unsaved edits"
                      />
                    ) : null}
                  </span>
                  <span className="block truncate text-[9px] text-muted-foreground">{typeName(block)}</span>
                </span>
                {target?.animationPath ? <span className="text-[9px] text-muted-foreground">A</span> : null}
                {blockTextures.some((binding) => binding.file) ? (
                  <ImageIcon className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Local texture" />
                ) : null}
              </button>
            </div>
          );
        })}
      </div>

      {selectedBlock ? (
        <Tabs
          defaultValue={canEdit ? "edit" : liveAuthor ? "color" : "block"}
          className="flex min-h-0 flex-1 flex-col p-2"
        >
          <TabsList
            className={cn(
              "grid h-7 w-full shrink-0 rounded-md p-0.5",
              canEdit && liveAuthor
                ? "grid-cols-5"
                : canEdit || liveAuthor
                  ? "grid-cols-4"
                  : "grid-cols-3",
            )}
          >
            {canEdit ? (
              <TabsTrigger value="edit" className="h-6 rounded px-1 text-[9px]">Edit</TabsTrigger>
            ) : null}
            {liveAuthor ? (
              <TabsTrigger value="color" className="h-6 rounded px-1 text-[9px]">Color</TabsTrigger>
            ) : null}
            <TabsTrigger value="block" className="h-6 rounded px-1 text-[9px]">Block</TabsTrigger>
            <TabsTrigger value="controls" className="h-6 rounded px-1 text-[9px]">Controls</TabsTrigger>
            <TabsTrigger value="material" className="h-6 rounded px-1 text-[9px]">Material</TabsTrigger>
          </TabsList>

          {canEdit && doc && inventory && onDocumentChange && onEditorError ? (
            <TabsContent value="edit" className="custom-scrollbar-thin min-h-0 flex-1 overflow-y-auto">
              <EfxbnBlockEditor
                document={doc}
                blockIndex={selectedBlock.index}
                inventory={inventory}
                frameCount={frameCount}
                disabled={writing}
                onChange={onDocumentChange}
                onError={onEditorError}
              />
            </TabsContent>
          ) : null}

          {liveAuthor && doc && onPatchColor ? (
            <TabsContent value="color" className="custom-scrollbar-thin min-h-0 flex-1 overflow-y-auto">
              <EfxbnColorAuthor
                document={doc}
                block={selectedBlock}
                plan={plan}
                progress={progress}
                writing={writing}
                onPatchColor={onPatchColor}
              />
            </TabsContent>
          ) : null}

          <TabsContent value="block" className="custom-scrollbar-thin min-h-0 flex-1 overflow-y-auto">
            <InspectorRow label="Index" value={String(selectedBlock.index)} />
            <InspectorRow label="Runtime type" value={`${selectedBlock.effectType} (${typeName(selectedBlock)})`} />
            <InspectorRow label="Tree level" value={String(selectedBlock.level)} />
            {isEfxbnEmitterBlock(selectedBlock) ? (
              <InspectorRow
                label="Child blocks"
                value={efxbnChildIndexes(selectedBlock).join(", ")}
              />
            ) : null}
            <InspectorRow
              label="Lifetime"
              value={`${selectedBlock.lifeTimeBase.toFixed(3)} ± ${(selectedBlock.lifeTimeRandom * 100).toFixed(1)}%`}
            />
            <InspectorRow
              label="Emit"
              value={`${selectedBlock.numEmit} / ${selectedBlock.intervalBase.toFixed(3)}f`}
            />
            <InspectorRow label="Delay" value={`${selectedBlock.delayEmitTimeBase.toFixed(3)}f`} />
            <InspectorRow label="Spawn form" value={String(selectedBlock.spawnFormType)} />
            <InspectorRow
              label="Action flags"
              value={`0x${selectedBlock.actionFlags.toString(16).toUpperCase().padStart(8, "0")}`}
            />
            <InspectorRow
              label="Depth / blend"
              value={`Z${selectedBlock.zTestEnable ? "T" : "-"}${efxbnRuntime(selectedBlock).zWriteEnable ? "W" : "-"} · ${blendStateLabel}`}
            />
            <InspectorRow label="Culling" value={cullingTypeLabel} />
            <InspectorRow label="Draw order" value={drawOrderLabel} />
            <InspectorRow label="View-angle ramp" value={viewAngleRampLabel} />
            <InspectorRow label="Camera fade" value={cameraFadeLabel} />
            <InspectorRow label="Model" value={modelLabel} />
            <InspectorRow label="Animation" value={selectedBlock.animationHash.signed === 0 ? "none" : selectedBlock.animationHash.hex} />
          </TabsContent>

          <TabsContent value="controls" className="custom-scrollbar-thin min-h-0 flex-1 overflow-y-auto">
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
              <p className="py-2 text-[10px] text-muted-foreground">No active control lanes.</p>
            )}
          </TabsContent>

          <TabsContent value="material" className="custom-scrollbar-thin min-h-0 flex-1 overflow-y-auto">
            <div className="border-b border-border/45 py-1.5">
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="min-w-0 truncate text-[9px] font-medium">Shader variants</span>
                <span
                  className="ml-auto shrink-0 font-mono text-[9px] text-muted-foreground"
                  title="Runtime draw-scheme flag word (element +0x390)"
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
                  <span className="text-[9px] text-muted-foreground">base only</span>
                )}
              </div>
              {shaderVariants.length > 0 ? (
                <p className="mt-1 text-[9px] text-amber-600 dark:text-amber-400">
                  Preview renders the base shader only; this block will not match the game.
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
                      {EFXBN_TEXTURE_SLOT_LABELS[binding.slot]}
                    </span>
                    <span className="shrink-0 font-mono text-[9px] text-muted-foreground">
                      #{binding.controlIndex}
                    </span>
                    <Badge
                      variant={binding.source ? "outline" : "secondary"}
                      className="ml-auto h-4 shrink-0 px-1 text-[8px]"
                      title={resourceSourceTitle(binding.source)}
                    >
                      {binding.source ? resourceSourceLabel(binding.source) : "missing"}
                    </Badge>
                  </div>
                  <div className="mt-1 truncate font-mono text-[9px] text-muted-foreground" title={binding.file?.path}>
                    {binding.parameter.colorMapHash.hex}
                  </div>
                  <div className="mt-1 flex gap-2 text-[9px] text-muted-foreground">
                    <span>UV {binding.parameter.uvPatternType}</span>
                    <span>flags 0x{binding.parameter.textureSettingFlags.toString(16).toUpperCase()}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="py-2 text-[10px] text-muted-foreground">No model-control texture slots.</p>
            )}
          </TabsContent>
        </Tabs>
      ) : null}

      {liveAuthor ? (
        <footer
          className={cn(
            "shrink-0 border-t px-2 py-2",
            draftDirty
              ? "border-amber-500/25 bg-amber-500/[0.06]"
              : "border-border/60 bg-muted/15",
          )}
          aria-label="EFXBN document actions"
        >
          <div className="mb-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="truncate text-[10px] font-medium text-muted-foreground">EFXBN file</span>
            {draftDirty ? (
              <Badge
                variant="outline"
                className="h-4 shrink-0 border-amber-500/40 px-1.5 text-[8px] text-amber-400"
              >
                {dirtyCount} unsaved
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="h-4 shrink-0 border-emerald-500/30 px-1.5 text-[8px] text-emerald-400"
              >
                clean
              </Badge>
            )}
            {writing ? (
              <Badge variant="outline" className="h-4 shrink-0 px-1.5 text-[8px] text-muted-foreground">
                writing
              </Badge>
            ) : null}
          </div>
          <p
            className="mb-2 truncate font-mono text-[9px] text-muted-foreground"
            title={doc?.path}
          >
            {doc?.path || "No document"}
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
                title={doc && canUndoEfxbn(doc) ? `Undo ${doc.changeLog.at(-1) ?? ""}` : "Nothing to undo"}
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
                title="Redo"
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
                title="Discard every unsaved change and return to the file on disk"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
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
                    ? `Rewrite ${doc.path} from the edited document`
                    : "Rewrite the efxbn file from the edited document"
                }
              >
                <Save className="h-3.5 w-3.5" />
                {writing ? "Writing…" : draftDirty ? `Save EFXBN (${dirtyCount})` : "Save EFXBN"}
              </Button>
            ) : null}
          </div>
        </footer>
      ) : null}
    </aside>
  );
}
