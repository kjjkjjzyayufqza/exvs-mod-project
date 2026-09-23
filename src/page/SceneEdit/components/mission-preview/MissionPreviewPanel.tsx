import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Crosshair,
  Eye,
  EyeOff,
  FileCode2,
  GitBranch,
  Map as MapIcon,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  groupMarkersByPhase,
  winFlagLabels,
  type MissionDeployPhase,
  type MissionSpawnMarker,
} from "@/services/missionPreview/missionPreviewService";
import { MayaSection } from "../MayaSection";
import {
  INSPECTOR_PROP_LABEL,
  INSPECTOR_PROP_ROW,
  MAYA_AXIS_HEADER,
  MAYA_TRANSFORM_GRID,
  OUTLINER_ROW,
  TOOL_BTN,
  TOOL_WINDOW_BAR,
  TOOL_WINDOW_BODY,
  TOOL_WINDOW_SCROLL,
  TOOL_WINDOW_STATUS,
} from "../propertyPanelStyles";
import {
  MISSION_SELECTION_COLOR,
  missionMarkerColor,
  missionPhaseColor,
  missionPhaseKey,
} from "./missionPreviewTheme";
import { MissionSpawnAuthoringHint, type MissionSpawnEditMode } from "./MissionSpawnAuthoringHint";
import {
  MAX_MARKER_SCALE,
  MIN_MARKER_SCALE,
  type MissionPreviewController,
} from "./useMissionPreview";

const MISSION_PREVIEW_MODAL_DIMENSIONS = {
  width: 520,
  height: 720,
  minWidth: 420,
  minHeight: 420,
};

interface MissionPreviewPanelProps {
  controller: MissionPreviewController;
  onClose: () => void;
  /** Load the map the script names, extracting it first when needed. */
  onLoadMissionMap: (mapHash: number) => void;
  /** Marker list from the live authoring graph, when a node-editor session is open. */
  markers?: readonly MissionSpawnMarker[];
  onEditNodes: () => void;
  onOpenScript: () => void;
  onClearScript: () => void;
  /** `ready` once the node editor owns the graph and spawn drags write back. */
  spawnEdit?: MissionSpawnEditMode;
  /** `false` when the selected slot uses external coordinates and cannot be dragged. */
  selectedSlotDraggable?: boolean | null;
  onSelectSlot?: (slot: number | null) => void;
}

function hashLabel(hash: number): string {
  return `0x${(hash >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
}

function basenameOf(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}

/** Details-panel row: left label, right value, both optically aligned. */
function PropRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={INSPECTOR_PROP_ROW}>
      <span className={INSPECTOR_PROP_LABEL}>{label}</span>
      <span className="col-span-2 min-w-0 truncate text-right text-[10px] tabular-nums">
        {children}
      </span>
    </div>
  );
}

export function MissionPreviewPanel({
  controller,
  onClose,
  onLoadMissionMap,
  markers: markerOverride,
  onEditNodes,
  onOpenScript,
  onClearScript,
  spawnEdit = "ready",
  selectedSlotDraggable = null,
  onSelectSlot,
}: MissionPreviewPanelProps) {
  const { t } = useTranslation("scene-mission-preview");
  const { preview } = controller;
  const markers = markerOverride ?? controller.markers;
  const canEditNodes = preview?.sourceKind === "decompiledC" && !!controller.scriptPath;

  const phaseGroups = useMemo(() => groupMarkersByPhase(markers), [markers]);

  const phaseTitle = (phase: MissionDeployPhase): string => {
    if (phase.kind === "initial") return t("phase.initial");
    if (phase.kind === "opening") return t("phase.opening");
    return t("phase.wave", { index: phase.waveIndex + 1 });
  };

  const phaseRule = (phase: MissionDeployPhase): string | null =>
    phase.kind === "wave"
      ? t("phase.waveRule", {
          enemies: phase.enemiesAliveAtMost,
          seconds: phase.delaySeconds,
        })
      : null;

  const winLabels = preview
    ? winFlagLabels(preview.config.winFlags).map((key) => t(`rules.flag.${key}`))
    : [];
  const loseLabels = preview
    ? winFlagLabels(preview.config.loseFlags).map((key) => t(`rules.flag.${key}`))
    : [];

  return (
    <AppRndModalShell
      title={t("title")}
      subtitle={controller.scriptPath ? basenameOf(controller.scriptPath) : undefined}
      titleId="scene-mission-preview"
      headerIcon={<FileCode2 className="h-4 w-4" />}
      dimensions={MISSION_PREVIEW_MODAL_DIMENSIONS}
      storageKey="scene-mission-preview"
      onClose={onClose}
    >
      <div className={TOOL_WINDOW_BODY}>
        <div className={TOOL_WINDOW_BAR}>
          <Button
            size="sm"
            variant="secondary"
            className={TOOL_BTN}
            onClick={() => void onOpenScript()}
          >
            <FileCode2 className="h-3.5 w-3.5" />
            {t("actions.openScript")}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className={TOOL_BTN}
            disabled={!canEditNodes || controller.loading}
            title={t("actions.editNodesHint")}
            onClick={() => void onEditNodes()}
          >
            <GitBranch className="h-3.5 w-3.5" />
            {t("actions.editNodes")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={TOOL_BTN}
            disabled={!controller.scriptPath || controller.loading}
            onClick={() => void controller.reload()}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", controller.loading && "animate-spin")}
            />
            {t("actions.reload")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={TOOL_BTN}
            disabled={!controller.scriptPath}
            onClick={onClearScript}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("actions.clear")}
          </Button>
          <div className="ml-auto flex items-center gap-1.5">
            <Label
              htmlFor="mission-hot-reload"
              className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
            >
              {t("actions.hotReload")}
            </Label>
            <Switch
              id="mission-hot-reload"
              checked={controller.hotReload}
              onCheckedChange={controller.setHotReload}
              className="scale-[0.8]"
            />
          </div>
        </div>

        <div className={TOOL_WINDOW_SCROLL}>
          {controller.error && (
            <div className="m-2 rounded-sm border border-destructive/45 bg-destructive/10 px-2 py-1.5">
              <p className="text-[11px] font-semibold text-destructive">
                {t("errors.parseFailed")}
              </p>
              <p className="mt-1 break-all font-mono text-[10px] leading-relaxed opacity-80">
                {controller.error}
              </p>
            </div>
          )}

          {controller.unitNameError && (
            <p className="m-2 rounded-sm border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[10px] leading-relaxed [text-wrap:pretty]">
              {t("warnings.unitNames", { reason: controller.unitNameError })}
            </p>
          )}

          {!preview && !controller.error && (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <Crosshair className="h-5 w-5 opacity-40" />
              <p className="max-w-[22rem] text-[11px] leading-relaxed text-muted-foreground [text-wrap:pretty]">
                {t("status.noScript")}
              </p>
              <Button
                size="sm"
                variant="secondary"
                className={cn(TOOL_BTN, "mt-1")}
                onClick={() => void controller.pickScript()}
              >
                <FileCode2 className="h-3.5 w-3.5" />
                {t("actions.openScript")}
              </Button>
            </div>
          )}

          {preview && spawnEdit !== "ready" && (
            <div className="m-2">
              <MissionSpawnAuthoringHint
                mode={spawnEdit}
                onEditNodes={() => void onEditNodes()}
              />
            </div>
          )}

          {preview && (
            <>
              <MayaSection title={t("source.section")} badge={preview.configFunction}>
                <div className="flex flex-col gap-px">
                  <PropRow label={t("source.kind")}>
                    {preview.sourceKind === "decompiledC"
                      ? t("source.c")
                      : t("source.compiled")}
                  </PropRow>
                  <PropRow label={t("source.waves")}>
                    {preview.wavesReadable ? (
                      t("source.wavesReadable")
                    ) : (
                      <span className="text-amber-500">{t("source.wavesUnreadable")}</span>
                    )}
                  </PropRow>
                  <div className={INSPECTOR_PROP_ROW}>
                    <span className={INSPECTOR_PROP_LABEL}>{t("rules.map")}</span>
                    <span className="min-w-0 truncate text-right font-mono text-[10px] tabular-nums">
                      {hashLabel(preview.config.mapHash)}
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      className={cn(TOOL_BTN, "h-5 px-1.5")}
                      onClick={() => onLoadMissionMap(preview.config.mapHash)}
                    >
                      <MapIcon className="h-3 w-3" />
                      {t("actions.loadMap")}
                    </Button>
                  </div>
                </div>
              </MayaSection>

              <MayaSection title={t("rules.title")}>
                <div className="flex flex-col gap-px">
                  <PropRow label={t("rules.win")}>
                    {winLabels.join(" / ") || t("rules.none")}
                  </PropRow>
                  <PropRow label={t("rules.lose")}>
                    {loseLabels.join(" / ") || t("rules.none")}
                  </PropRow>
                  <PropRow label={t("rules.targetCount")}>
                    {preview.config.targetCount}
                  </PropRow>
                  <PropRow label={t("rules.allowedLosses")}>
                    {preview.config.allowedLosses}
                  </PropRow>
                  <PropRow label={t("rules.teamCosts")}>
                    <span className="font-mono">{preview.config.teamCosts.join(" / ")}</span>
                  </PropRow>
                  <PropRow label={t("rules.bgm")}>
                    <span className="font-mono">{hashLabel(preview.config.bgmHash)}</span>
                  </PropRow>
                </div>
              </MayaSection>

              <MayaSection title={t("display.title")}>
                <div className="flex flex-col gap-1.5">
                  <div className={INSPECTOR_PROP_ROW}>
                    <span className={INSPECTOR_PROP_LABEL}>{t("display.markerScale")}</span>
                    <Slider
                      className="min-w-0"
                      min={MIN_MARKER_SCALE}
                      max={MAX_MARKER_SCALE}
                      step={1}
                      value={[controller.markerScale]}
                      onValueChange={(value) => controller.setMarkerScale(value[0])}
                    />
                    <span className="w-7 text-right font-mono text-[10px] tabular-nums">
                      {controller.markerScale}
                    </span>
                  </div>
                  <div className={INSPECTOR_PROP_ROW}>
                    <span className={INSPECTOR_PROP_LABEL}>{t("display.showLabels")}</span>
                    <span className="col-span-2 flex justify-end">
                      <Switch
                        checked={controller.showLabels}
                        onCheckedChange={controller.setShowLabels}
                        className="scale-[0.8]"
                        aria-label={t("display.showLabels")}
                      />
                    </span>
                  </div>
                </div>
              </MayaSection>

              <MayaSection title={t("phases.title")} badge={markers.length}>
                {phaseGroups.length === 0 ? (
                  <p className="px-1 py-3 text-center text-[10px] text-muted-foreground [text-wrap:pretty]">
                    {t("phases.empty")}
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {phaseGroups.map((group) => {
                      const key = missionPhaseKey(group.phase);
                      const hidden = controller.hiddenPhaseKeys.has(key);
                      const rule = phaseRule(group.phase);
                      const groupColor = missionPhaseColor(group.phase, group.markers);
                      return (
                        <section key={group.key} className="min-w-0">
                          <header className="flex items-center gap-1.5 border-b border-border/35 pb-1">
                            <button
                              type="button"
                              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors duration-100 hover:bg-accent/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
                              onClick={() => controller.togglePhaseVisible(key)}
                              aria-pressed={!hidden}
                              aria-label={phaseTitle(group.phase)}
                            >
                              {hidden ? (
                                <EyeOff className="h-3 w-3" />
                              ) : (
                                <Eye className="h-3 w-3" />
                              )}
                            </button>
                            <span
                              className="h-2.5 w-[3px] shrink-0 rounded-[1px]"
                              style={{ backgroundColor: groupColor }}
                            />
                            <span
                              className={cn(
                                "min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-wider",
                                hidden ? "text-muted-foreground/50" : "text-foreground/85",
                              )}
                            >
                              {phaseTitle(group.phase)}
                            </span>
                            <span className="shrink-0 font-mono text-[9px] tabular-nums text-muted-foreground">
                              {group.markers.length}
                            </span>
                          </header>

                          {rule && (
                            <p className="mt-1 pl-[1.625rem] text-[10px] leading-snug text-muted-foreground [text-wrap:pretty]">
                              {rule}
                            </p>
                          )}

                          <ul className={cn("mt-1 flex flex-col", hidden && "opacity-40")}>
                            {group.markers.map((marker) => {
                              const selected = controller.selectedSlot === marker.slot;
                              return (
                                <li key={marker.key}>
                                  <button
                                    type="button"
                                    data-selected={selected}
                                    className={OUTLINER_ROW}
                                    style={
                                      selected
                                        ? { boxShadow: `inset 2px 0 0 ${MISSION_SELECTION_COLOR}` }
                                        : undefined
                                    }
                                    onClick={() => {
                                      const next = selected ? null : marker.slot;
                                      if (onSelectSlot) onSelectSlot(next);
                                      else controller.setSelectedSlot(next);
                                    }}
                                  >
                                    <span
                                      className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                                      style={{ backgroundColor: missionMarkerColor(marker) }}
                                    />
                                    <span className="w-6 shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                                      {marker.slot}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-[11px]">
                                      {controller.unitNameOf(marker.unitId)}
                                    </span>
                                    <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                                      {marker.team === 0 ? t("team.player") : t("team.enemy")}
                                    </span>
                                  </button>

                                  {selected && <SlotTransform marker={marker} />}
                                  {selected && selectedSlotDraggable === false && (
                                    <p className="mb-1 ml-6.5 text-[10px] leading-snug text-pretty text-amber-500">
                                      {t("spawn.externalLocked")}
                                    </p>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </section>
                      );
                    })}
                  </div>
                )}
              </MayaSection>
            </>
          )}
        </div>

        {preview && (
          <div className={TOOL_WINDOW_STATUS}>
            <span className="truncate font-mono">{controller.scriptPath}</span>
            <span className="ml-auto shrink-0 font-mono tabular-nums">
              {t("status.slots", { count: markers.length })}
            </span>
          </div>
        )}
      </div>
    </AppRndModalShell>
  );
}

/** Channel-box style X/Y/Z readout for the selected slot. */
function SlotTransform({ marker }: { marker: MissionSpawnMarker }) {
  const { t } = useTranslation("scene-mission-preview");
  const cell =
    "h-5 min-w-0 rounded-sm border border-border/40 bg-muted/25 px-1 text-right font-mono text-[10px] leading-5 tabular-nums";

  return (
    <div className="mb-1 ml-[1.625rem] mt-1 flex flex-col gap-1">
      <div className={MAYA_TRANSFORM_GRID}>
        <span className="truncate text-[9px] font-medium text-muted-foreground">
          {t("slot.position")}
        </span>
        <span className={cn(MAYA_AXIS_HEADER, "text-muted-foreground")}>X</span>
        <span className={cn(MAYA_AXIS_HEADER, "text-muted-foreground")}>Y</span>
        <span className={cn(MAYA_AXIS_HEADER, "text-muted-foreground")}>Z</span>
        <span />
        <span className={cell}>{marker.position[0]}</span>
        <span className={cell}>{marker.position[1]}</span>
        <span className={cell}>{marker.position[2]}</span>
      </div>
      <div className="grid grid-cols-3 gap-1">
        <MiniStat label={t("slot.facing")} value={`${marker.facingDegrees}°`} />
        <MiniStat label={t("slot.intro")} value={String(marker.introAction)} />
        <MiniStat label={t("slot.ai")} value={String(marker.aiLevel)} />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-px rounded-sm border border-border/35 bg-muted/15 px-1.5 py-1">
      <span className="truncate text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="truncate font-mono text-[10px] tabular-nums">{value}</span>
    </div>
  );
}
