import {
  RELOAD_BEHAVIOR_TYPE_LABELS,
  getArmsReloadProfile,
  getReloadDurationForSelector,
  type ReloadBehaviorType,
} from "@/lib/gameAlgorithms/reloadSystem";
import {
  describeChargeInputFlags,
  getArmsChargeProfile,
  getChargeDurationForSelector,
  getChargeFullDurationForSelector,
} from "@/lib/gameAlgorithms/chargeSystem";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import { formatFrames } from "./armsFieldModel";

interface ActionReloadTimelinePanelProps {
  entry: TypedParamEntry;
}

/** Native charge/reload view; intentionally does not infer weapon action frames. */
export function ActionReloadTimelinePanel({
  entry,
}: ActionReloadTimelinePanelProps) {
  const profile = getArmsReloadProfile(entry);
  const charge = getArmsChargeProfile(entry);
  const reloadLabel =
    RELOAD_BEHAVIOR_TYPE_LABELS[
      profile.reloadBehaviorType as ReloadBehaviorType
    ] ?? `Type ${profile.reloadBehaviorType} (outside native 0-5 range)`;
  const selectors = [0, 1, 2, 3, 4, 5];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border bg-card p-3 text-[10px] shadow-sm">
        <span className="text-muted-foreground">Capacity / initial</span>
        <span className="font-mono">
          {profile.ammoCount} / {profile.initialAmmoCount}
        </span>
        <span className="text-muted-foreground">Native slot</span>
        <span className="font-mono">{profile.slotIndex}</span>
        <span className="text-muted-foreground">Reload behavior</span>
        <span className="font-mono">{reloadLabel}</span>
        <span className="text-muted-foreground">Charge input</span>
        <span className="font-mono">
          {describeChargeInputFlags(charge.inputFlags)}
        </span>
        <span className="text-muted-foreground">Charge stages</span>
        <span className="font-mono">{charge.stageCount}</span>
        <span className="text-muted-foreground">Behavior flags</span>
        <span className="font-mono">
          0x{profile.behaviorFlags.toString(16).toUpperCase()}
        </span>
      </div>

      <div className="space-y-1.5">
        <h4 className="text-[10px] font-medium text-muted-foreground">
          Charge stages and timing
        </h4>
        <div className="overflow-hidden rounded-md border border-border/50">
          <table className="w-full border-collapse text-left text-[10px]">
            <thead className="bg-muted/25 text-muted-foreground">
              <tr>
                <th className="px-2.5 py-1.5 font-medium">Selector</th>
                <th className="px-2.5 py-1.5 text-right font-medium">
                  Charge / stage
                </th>
                <th className="px-2.5 py-1.5 text-right font-medium">
                  Charge to max
                </th>
                <th className="px-2.5 py-1.5 text-right font-medium">
                  Decay / stage
                </th>
              </tr>
            </thead>
            <tbody>
              {selectors.map((selector) => (
                <tr key={selector} className="border-t border-border/40">
                  <td className="px-2.5 py-1.5 font-mono text-muted-foreground">
                    {selector === 0 ? "default" : `mode ${selector}`}
                  </td>
                  <td className="px-2.5 py-1.5 text-right font-mono tabular-nums">
                    {formatFrames(
                      getChargeDurationForSelector(charge.accumulate, selector),
                    )}
                  </td>
                  <td className="px-2.5 py-1.5 text-right font-mono tabular-nums">
                    {formatFrames(
                      getChargeFullDurationForSelector(charge, selector),
                    )}
                  </td>
                  <td className="px-2.5 py-1.5 text-right font-mono tabular-nums">
                    {formatFrames(
                      getChargeDurationForSelector(charge.decay, selector),
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-1.5">
        <h4 className="text-[10px] font-medium text-muted-foreground">
          Reload duration selectors
        </h4>
        <div className="overflow-hidden rounded-md border border-border/50">
        <table className="w-full border-collapse text-left text-[10px]">
          <thead className="bg-muted/25 text-muted-foreground">
            <tr>
              <th className="px-2.5 py-1.5 font-medium">Selector</th>
              <th className="px-2.5 py-1.5 text-right font-medium">Group A</th>
              <th className="px-2.5 py-1.5 text-right font-medium">Group B</th>
            </tr>
          </thead>
          <tbody>
            {selectors.map((selector) => (
              <tr key={selector} className="border-t border-border/40">
                <td className="px-2.5 py-1.5 font-mono text-muted-foreground">
                  {selector === 0 ? "default" : `mode ${selector}`}
                </td>
                <td className="px-2.5 py-1.5 text-right font-mono tabular-nums">
                  {formatFrames(
                    getReloadDurationForSelector(profile.groupA, selector),
                  )}
                </td>
                <td className="px-2.5 py-1.5 text-right font-mono tabular-nums">
                  {formatFrames(
                    getReloadDurationForSelector(profile.groupB, selector),
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <p className="text-[10px] leading-relaxed text-muted-foreground/80">
        Charge progress runs from 0 to 1 inside each integer stage. Holding the
        configured input advances by elapsed frames divided by charge duration;
        releasing it uses the decay duration in reverse. Runtime selector modes
        1–5 remain unnamed; reload group B is gated by reloadGroupBEnabled.
      </p>
    </div>
  );
}
