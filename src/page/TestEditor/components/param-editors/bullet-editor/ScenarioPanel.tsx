import { Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBulletEditorStore } from "./BulletEditorStore";

function numberInputValue(value: number): string {
  if (!Number.isFinite(value)) return "";
  return String(value);
}

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
