import { Activity, Box, CornerDownRight, Eye, EyeOff, ImageIcon, Layers3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { EfxbnEffectSummary } from "@/services/effectFolder/effectFolderService";
import { evaluateEfxbnControl, type EffectFolderPreviewPlan } from "./effectFolderPreviewPlan";
import {
  efxbnChildIndexes,
  findEfxbnParentBlocks,
  isEfxbnEmitterBlock,
  EFXBN_ELEMENT_TYPE,
  efxbnRuntime,
} from "./efxbnSimulation";

type EfxbnPreviewInspectorProps = {
  plan: EffectFolderPreviewPlan;
  progress: number;
  selectedEffectIndex: number | null;
  hiddenEffectIndexes: ReadonlySet<number>;
  onSelectEffect: (effectIndex: number) => void;
  onSetEffectVisible: (effectIndex: number, visible: boolean) => void;
  onShowAll: () => void;
  onSolo: (effectIndex: number) => void;
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
}: EfxbnPreviewInspectorProps) {
  const selectedBlock =
    plan.effectBlocks.find((block) => block.index === selectedEffectIndex) ?? plan.effectBlocks[0] ?? null;
  const activeControls =
    selectedBlock?.controlReferences.filter((reference) => reference.selector !== 0) ?? [];
  const textureBindings = selectedBlock
    ? plan.textureBindings.filter((binding) => binding.effectIndex === selectedBlock.index)
    : [];

  return (
    <aside className="flex h-full min-h-0 flex-col bg-muted/10" aria-label="EFXBN block inspector">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b px-2">
        <Layers3 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <span className="text-[11px] font-medium">Blocks</span>
        <span className="text-[10px] tabular-nums text-muted-foreground">{plan.effectBlocks.length}</span>
        <div className="flex-1" />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-6 w-6"
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
            className="h-6 px-1.5 text-[10px]"
            onClick={() => onSolo(selectedBlock.index)}
            title="Hide every block except the selected block"
          >
            Solo
          </Button>
        ) : null}
      </div>

      <div className="custom-scrollbar-thin max-h-[42%] shrink-0 overflow-y-auto border-b p-1">
        {plan.effectBlocks.map((block) => {
          const selected = block.index === selectedBlock?.index;
          const visible = !hiddenEffectIndexes.has(block.index);
          const target = plan.targets.find((candidate) => candidate.effectIndex === block.index);
          const blockTextures = plan.textureBindings.filter((binding) => binding.effectIndex === block.index);
          const linkedFrom = findEfxbnParentBlocks(plan.effectBlocks, block.index)[0];
          return (
            <div
              key={block.index}
              className={cn(
                "group flex min-h-9 items-center gap-1 border-l-2 px-1",
                selected ? "border-l-primary bg-primary/10" : "border-l-transparent hover:bg-muted/60",
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
                  <span className="block truncate text-[10px] font-medium">Block {String(block.index).padStart(2, "0")}</span>
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
        <Tabs defaultValue="block" className="flex min-h-0 flex-1 flex-col p-2">
          <TabsList className="grid h-7 w-full shrink-0 grid-cols-3 rounded-md p-0.5">
            <TabsTrigger value="block" className="h-6 rounded px-1 text-[9px]">Block</TabsTrigger>
            <TabsTrigger value="controls" className="h-6 rounded px-1 text-[9px]">Controls</TabsTrigger>
            <TabsTrigger value="material" className="h-6 rounded px-1 text-[9px]">Material</TabsTrigger>
          </TabsList>

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
              value={`Z${selectedBlock.zTestEnable ? "T" : "-"}${efxbnRuntime(selectedBlock).zWriteEnable ? "W" : "-"} · ${selectedBlock.blendState}`}
            />
            <InspectorRow label="Model" value={selectedBlock.modelHash.signed === 0 ? "none" : selectedBlock.modelHash.hex} />
            <InspectorRow label="Animation" value={selectedBlock.animationHash.signed === 0 ? "none" : selectedBlock.animationHash.hex} />
          </TabsContent>

          <TabsContent value="controls" className="custom-scrollbar-thin min-h-0 flex-1 overflow-y-auto">
            {activeControls.length > 0 ? (
              activeControls.map((reference) => (
                <div key={reference.index} className="flex items-center gap-2 border-b border-border/45 py-1.5 last:border-b-0">
                  <span className="w-12 shrink-0 font-mono text-[9px]">{reference.name}</span>
                  <Badge variant="outline" className="h-4 px-1 text-[8px]">
                    {reference.selector === 1 ? "direct" : `${reference.selector} keys`}
                  </Badge>
                  <span className="ml-auto font-mono text-[9px] tabular-nums">
                    {evaluateEfxbnControl(reference, plan.controlLookupEntries, progress).toFixed(4)}
                  </span>
                </div>
              ))
            ) : (
              <p className="py-2 text-[10px] text-muted-foreground">No active control lanes.</p>
            )}
          </TabsContent>

          <TabsContent value="material" className="custom-scrollbar-thin min-h-0 flex-1 overflow-y-auto">
            {textureBindings.length > 0 ? (
              textureBindings.map((binding, index) => (
                <div key={`${binding.controlIndex}-${index}`} className="border-b border-border/45 py-1.5 last:border-b-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[9px]">slot {binding.controlIndex}</span>
                    <Badge variant={binding.file ? "outline" : "secondary"} className="ml-auto h-4 px-1 text-[8px]">
                      {binding.file ? "local" : "external"}
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
    </aside>
  );
}
