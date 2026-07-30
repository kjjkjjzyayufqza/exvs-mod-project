import {
  getActionTimeline,
  getReloadTimeline,
  RELOAD_TYPE_LABELS,
  type ReloadType,
} from "@/lib/gameAlgorithms/reloadSystem";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import {
  FrameTickRuler,
  TimelineVisualizer,
  buildReloadTimeline,
  buildWeaponTimeline,
} from "../shared/TimelineVisualizer";

interface ActionReloadTimelinePanelProps {
  entry: TypedParamEntry;
}

function num(entry: TypedParamEntry, key: string): number {
  const v = entry[key];
  return typeof v === "number" ? v : 0;
}

function reloadTypeLabel(reloadType: number): string {
  const known = RELOAD_TYPE_LABELS[reloadType as ReloadType];
  return known ?? `Type ${reloadType} (outside known 0-3 range)`;
}

/**
 * Frame timelines for the selected armsparam entry: the action phase bar
 * (startup / active / recovery / cooldown) and the raw reload frame fields.
 * Reload segments keep hash labels on purpose — reload type semantics are
 * unverified (see reloadSystem.ts evidence notes).
 */
export function ActionReloadTimelinePanel({
  entry,
}: ActionReloadTimelinePanelProps) {
  const action = getActionTimeline(entry);
  const reload = getReloadTimeline(entry);

  const actionSegments = buildWeaponTimeline(
    action.startupFrame,
    action.activeFrame,
    action.recoveryFrame,
    action.cooldownFrame,
  );
  const actionTotalFrames = actionSegments.reduce(
    (sum, segment) => sum + segment.frames,
    0,
  );
  const reloadSegments = buildReloadTimeline(
    reload.reloadType,
    reload.reloadTimeTotal,
    reload.reloadPerShotFrame,
    num(entry, "ammoCount"),
    reload.overheatFrame,
    reload.chargeFrame,
  );

  return (
    <div className="space-y-3">
      <div>
        <TimelineVisualizer segments={actionSegments} />
        {actionTotalFrames > 0 && (
          <FrameTickRuler totalFrames={actionTotalFrames} className="mx-3" />
        )}
      </div>

      <TimelineVisualizer
        segments={reloadSegments}
        title="Raw Reload Timeline"
      />

      <div className="rounded-md border bg-card p-3 shadow-sm">
        <h4 className="mb-2 text-[11px] font-semibold text-muted-foreground">
          Raw Duration Fields
        </h4>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
          <span className="text-muted-foreground">Reload type</span>
          <span className="font-mono">{reloadTypeLabel(reload.reloadType)}</span>
          <span className="text-muted-foreground">totalDurationFrame</span>
          <span className="font-mono">{action.totalDurationFrame}f</span>
          <span className="text-muted-foreground">landingRecoveryFrame</span>
          <span className="font-mono">{action.landingRecoveryFrame}f</span>
          <span className="text-muted-foreground">fullChargeFrame</span>
          <span className="font-mono">{reload.fullChargeFrame}f</span>
        </div>
      </div>
    </div>
  );
}
