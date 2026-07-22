import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import {
  getBoostAscentParameters,
  getTransformOrientationParameters,
} from "@/lib/gameAlgorithms/movementParamSemantics";

interface SpeedConsumerMapProps {
  entry: TypedParamEntry | null;
}

function raw(entry: TypedParamEntry, key: string): number {
  const value = entry[key];
  return typeof value === "number" ? value : 0;
}

function ParameterCard({
  title,
  values,
}: {
  title: string;
  values: Array<[string, number]>;
}) {
  return (
    <section className="rounded-md border bg-card/70 p-3">
      <h4 className="mb-2 text-[11px] font-semibold">{title}</h4>
      <dl className="space-y-1 text-[10px]">
        {values.map(([label, value]) => (
          <div className="flex items-center justify-between gap-3" key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-mono">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function SpeedConsumerMap({ entry }: SpeedConsumerMapProps) {
  if (!entry) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No speedparam entry selected
      </div>
    );
  }

  const ascent = getBoostAscentParameters(entry);
  const transform = getTransformOrientationParameters(entry);

  return (
    <div className="h-full overflow-y-auto bg-muted/10 p-4">
      <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">MSC consumer map</h3>
          <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">
            A-grade fields only
          </span>
        </div>
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
          Values are grouped by the action callbacks that read them. No radius,
          frame, gauge, or world-unit meaning is inferred from an unverified
          legacy label.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ParameterCard
          title="Boost ascent controls"
          values={[
            ["Vertical initial", ascent.verticalInitial],
            ["Vertical terminal", ascent.verticalTerminal],
            ["Yaw response", ascent.yawResponse],
            ["Turn-time angle scale", ascent.turnTimeAngleScale],
          ]}
        />
        <ParameterCard
          title="Boost dash controls"
          values={[
            ["Entry-turn timer", raw(entry, "boostDashEntryTurnTimer")],
            ["Loop timer", raw(entry, "boostDashLoopTimer")],
            ["Yaw response", raw(entry, "boostDashYawResponse")],
          ]}
        />
        <ParameterCard
          title="Step timers"
          values={[
            ["Ground primary", raw(entry, "groundStepPrimaryTimer")],
            ["Ground secondary", raw(entry, "groundStepSecondaryTimer")],
            ["Air primary", raw(entry, "airStepPrimaryTimer")],
            ["Air secondary", raw(entry, "airStepSecondaryTimer")],
          ]}
        />
        <ParameterCard
          title="Transform orientation"
          values={[
            ["Yaw response", transform.yawResponse],
            ["Roll target", transform.rollTargetMagnitude],
            ["Roll response", transform.rollResponse],
            ["Roll neutral retention", transform.rollNeutralRetention],
            ["Pitch response", transform.pitchResponse],
            ["Pitch neutral retention", transform.pitchNeutralRetention],
            ["Pitch pose scale", transform.pitchPoseScale],
          ]}
        />
        <ParameterCard
          title="Ground walk entry"
          values={[
            ["Entry speed", raw(entry, "groundWalkEntrySpeed")],
            ["Turn-time base", raw(entry, "groundWalkEntryTurnTimeBase")],
            [
              "Turn-time angle scale",
              raw(entry, "groundWalkEntryTurnTimeAngleScale"),
            ],
            ["Yaw response", raw(entry, "groundWalkYawResponse")],
          ]}
        />
        <ParameterCard
          title="Residual air drift"
          values={[
            ["Per-update delta", raw(entry, "residualAirDriftSpeedDelta")],
            ["Speed cap", raw(entry, "residualAirDriftSpeedCap")],
          ]}
        />
      </div>
    </div>
  );
}
