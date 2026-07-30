import { useMemo } from "react";
import {
  getHitVolume,
  describeSweepCoverage,
  verticalHitReach,
  boundingSphereRadius,
  SHAPE_MODE_LABELS,
  COLLISION_FLAG_LABELS,
} from "@/lib/gameAlgorithms";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";

// Engine default melee hurt sphere radius, used as the opponent radius when
// deriving the off-sweep hit band (docs/hitbox-research/02 §7: 7.0f default).
const DEFAULT_OPPONENT_HURT_RADIUS = 7;

interface SphereCoveragePanelProps {
  entry: TypedParamEntry;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="font-mono text-[11px]">{value}</span>
    </div>
  );
}

export function SphereCoveragePanel({ entry }: SphereCoveragePanelProps) {
  const { volume, coverage, vReach } = useMemo(() => {
    const v = getHitVolume(entry);
    return {
      volume: v,
      coverage: describeSweepCoverage(v),
      vReach: verticalHitReach(v, DEFAULT_OPPONENT_HURT_RADIUS),
    };
  }, [entry]);

  const isAttack = volume.collisionFlags === 0;

  return (
    <div className="space-y-1.5 rounded-md border bg-muted/10 p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-medium">Sphere coverage</span>
        <span className="text-[10px] text-muted-foreground">
          {COLLISION_FLAG_LABELS[volume.collisionFlags] ??
            `class ${volume.collisionFlags}`}
        </span>
      </div>

      <Row label="Shape mode" value={SHAPE_MODE_LABELS[volume.shapeMode]} />
      <Row label="Radius" value={coverage.radius.toFixed(2)} />
      <Row label="Diameter" value={coverage.diameter.toFixed(2)} />
      <Row
        label="Center (X, Y, Z-fwd)"
        value={`(${volume.center[0].toFixed(1)}, ${volume.center[1].toFixed(1)}, ${volume.center[2].toFixed(1)})`}
      />
      <Row label="Forward reach" value={coverage.forwardReach.toFixed(2)} />
      <Row label="Bounding radius" value={boundingSphereRadius(volume).toFixed(2)} />

      {isAttack && (
        <Row
          label={`Off-sweep hit band (vs r=${DEFAULT_OPPONENT_HURT_RADIUS})`}
          value={`${vReach.toFixed(2)}  (r_att + r_def)`}
        />
      )}

      <p className="border-t pt-1.5 text-[9px] leading-snug text-muted-foreground">
        {coverage.summary}
      </p>
    </div>
  );
}
