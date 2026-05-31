import { Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBulletEditorStore } from "./BulletEditorStore";
import {
  BULLET_LOCK_STATES,
  isInductionActive,
  type BulletLockState,
} from "../../bullet-preview/bulletPreviewTypes";

function numberInputValue(value: number): string {
  if (!Number.isFinite(value)) return "";
  return String(value);
}

const LOCK_STATE_SHORT: Record<BulletLockState, string> = {
  red: "Red",
  green: "Green",
  yellow: "Yellow",
  blue: "Blue",
};

const LOCK_STATE_ACTIVE_CLASS: Record<BulletLockState, string> = {
  red: "bg-red-600 text-white hover:bg-red-600",
  green: "bg-green-600 text-white hover:bg-green-600",
  yellow: "bg-yellow-500 text-black hover:bg-yellow-500",
  blue: "bg-blue-600 text-white hover:bg-blue-600",
};

export function ScenarioPanel() {
  const scenario = useBulletEditorStore((s) => s.scenario);
  const trajectory = useBulletEditorStore((s) => s.trajectory);
  const store = useBulletEditorStore;

  const setScenario = (patch: Record<string, unknown>) => {
    store.getState().setScenario(patch as Partial<typeof scenario>);
  };

  return (
    <div className="space-y-2 rounded-md border border-border/70 p-2">
      <div className="flex items-center gap-1.5 text-[11px] font-medium">
        <Target className="h-3.5 w-3.5 text-muted-foreground" />
        Target Scenario
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Distance Z</Label>
          <Input
            type="number"
            step={5}
            value={numberInputValue(scenario.targetDistance)}
            className="h-7 font-mono text-[11px]"
            onChange={(e) => setScenario({ targetDistance: Number(e.target.value) || 0 })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Height Y</Label>
          <Input
            type="number"
            step={0.5}
            value={numberInputValue(scenario.targetHeight)}
            className="h-7 font-mono text-[11px]"
            onChange={(e) => setScenario({ targetHeight: Number(e.target.value) || 0 })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Offset X</Label>
          <Input
            type="number"
            step={0.5}
            value={numberInputValue(scenario.targetOffsetX)}
            className="h-7 font-mono text-[11px]"
            onChange={(e) => setScenario({ targetOffsetX: Number(e.target.value) || 0 })}
          />
        </div>
      </div>
      <div className="space-y-1.5 rounded-md border border-border/60 p-2">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-[10px] text-muted-foreground">Lock state (induction)</Label>
          <span
            className={`text-[10px] font-medium ${
              isInductionActive(scenario.lockState) ? "text-emerald-400" : "text-muted-foreground"
            }`}
          >
            {isInductionActive(scenario.lockState) ? "Homing ON" : "No homing"}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {BULLET_LOCK_STATES.map((state) => (
            <Button
              key={state}
              type="button"
              size="sm"
              variant="outline"
              className={`h-6 px-1 text-[10px] ${
                scenario.lockState === state ? LOCK_STATE_ACTIVE_CLASS[state] : ""
              }`}
              onClick={() => setScenario({ lockState: state })}
            >
              {LOCK_STATE_SHORT[state]}
            </Button>
          ))}
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">
            Base launch speed (units/frame)
          </Label>
          <Input
            type="number"
            step={0.5}
            min={0}
            value={numberInputValue(scenario.launchSpeed)}
            className="h-7 font-mono text-[11px]"
            onChange={(e) => setScenario({ launchSpeed: Math.max(0, Number(e.target.value) || 0) })}
          />
          <p className="text-[9px] leading-snug text-muted-foreground/80">
            Not a bulletparam field — base velocity comes from the firing weapon/action.
            bulletparam fields apply as modifiers on top.
          </p>
        </div>
      </div>
      <div className="space-y-1 rounded-md border border-border/60 p-2">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-[10px] text-muted-foreground">Enemy lateral motion</Label>
          <Button
            type="button"
            size="sm"
            variant={scenario.enemyLateralMotionEnabled ? "secondary" : "outline"}
            className="h-6 px-2 text-[10px]"
            onClick={() => setScenario({ enemyLateralMotionEnabled: !scenario.enemyLateralMotionEnabled })}
          >
            {scenario.enemyLateralMotionEnabled ? "Enabled" : "Disabled"}
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Amplitude X</Label>
            <Input
              type="number"
              step={0.5}
              value={numberInputValue(scenario.enemyLateralAmplitude)}
              disabled={!scenario.enemyLateralMotionEnabled}
              className="h-7 font-mono text-[11px]"
              onChange={(e) => setScenario({ enemyLateralAmplitude: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Period (frames)</Label>
            <Input
              type="number"
              step={1}
              min={2}
              value={numberInputValue(scenario.enemyLateralPeriodFrames)}
              disabled={!scenario.enemyLateralMotionEnabled}
              className="h-7 font-mono text-[11px]"
              onChange={(e) => setScenario({ enemyLateralPeriodFrames: Math.max(2, Math.round(Number(e.target.value) || 2)) })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Phase (deg)</Label>
            <Input
              type="number"
              step={1}
              value={numberInputValue(scenario.enemyLateralPhaseDeg)}
              disabled={!scenario.enemyLateralMotionEnabled}
              className="h-7 font-mono text-[11px]"
              onChange={(e) => setScenario({ enemyLateralPhaseDeg: Number(e.target.value) || 0 })}
            />
          </div>
        </div>
      </div>
      {trajectory?.warnings?.length ? (
        <div className="space-y-0.5 text-[10px] leading-relaxed text-amber-400/95">
          {trajectory.warnings.slice(0, 3).map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
