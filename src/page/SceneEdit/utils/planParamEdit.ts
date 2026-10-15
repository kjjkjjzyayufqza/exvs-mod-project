import type { PlanParam, PlanPointId, PlanPointKind, PlanPointView, PlanVec3 } from "../types/planParam";

const KINDS: readonly PlanPointKind[] = ["spawnFirst", "spawnSecond", "marker", "respawn"];

export function planPointKey(id: PlanPointId): string {
  return `${id.kind}:${id.index}`;
}

export function parsePlanPointKey(key: string): PlanPointId | null {
  const split = key.indexOf(":");
  if (split <= 0) return null;
  const kind = key.slice(0, split);
  if (!KINDS.includes(kind as PlanPointKind)) return null;
  const index = Number(key.slice(split + 1));
  if (!Number.isInteger(index) || index < 0) return null;
  return { kind: kind as PlanPointKind, index };
}

function vec3(values: readonly number[]): PlanVec3 {
  return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0];
}

export function listPlanPoints(plan: PlanParam): PlanPointView[] {
  const points: PlanPointView[] = [];
  plan.spawnPairs.forEach((pair, index) => {
    points.push({
      id: { kind: "spawnFirst", index },
      key: planPointKey({ kind: "spawnFirst", index }),
      position: vec3(pair.first),
      trailing: pair.first[3] ?? 0,
    });
    points.push({
      id: { kind: "spawnSecond", index },
      key: planPointKey({ kind: "spawnSecond", index }),
      position: vec3(pair.second),
      trailing: pair.second[3] ?? 0,
    });
  });
  plan.markers.forEach((marker, index) => {
    points.push({
      id: { kind: "marker", index },
      key: planPointKey({ kind: "marker", index }),
      position: vec3(marker.position),
      trailing: marker.parameter,
    });
  });
  plan.respawnPoints.forEach((point, index) => {
    points.push({
      id: { kind: "respawn", index },
      key: planPointKey({ kind: "respawn", index }),
      position: vec3(point.position),
      trailing: point.padding,
    });
  });
  return points;
}

function copyPlan(plan: PlanParam): PlanParam {
  return {
    limit: plan.limit,
    limitPadding: plan.limitPadding,
    spawnPairs: plan.spawnPairs.map((pair) => ({
      first: [...pair.first],
      second: [...pair.second],
    })),
    markers: plan.markers.map((marker) => ({
      position: [...marker.position],
      parameter: marker.parameter,
    })),
    respawnPoints: plan.respawnPoints.map((point) => ({
      position: [...point.position],
      padding: point.padding,
    })),
  };
}

/** Replace xyz. The fourth word of that record stays as it was loaded. */
export function movePlanPoint(plan: PlanParam, id: PlanPointId, position: PlanVec3): PlanParam {
  const next = copyPlan(plan);
  if (id.kind === "spawnFirst" || id.kind === "spawnSecond") {
    const pair = next.spawnPairs[id.index];
    if (!pair) return plan;
    const slot = id.kind === "spawnFirst" ? pair.first : pair.second;
    slot[0] = position[0];
    slot[1] = position[1];
    slot[2] = position[2];
    return next;
  }
  if (id.kind === "marker") {
    const marker = next.markers[id.index];
    if (!marker) return plan;
    marker.position = [...position];
    return next;
  }
  const point = next.respawnPoints[id.index];
  if (!point) return plan;
  point.position = [...position];
  return next;
}

export function setPlanLimit(plan: PlanParam, limit: number): PlanParam {
  if (!Number.isFinite(limit)) return plan;
  return { ...copyPlan(plan), limit };
}

/** Marker arrows use this float as yaw. Spawn `w` and respawn padding stay untouched. */
export function setMarkerParameter(plan: PlanParam, index: number, parameter: number): PlanParam {
  if (!Number.isFinite(parameter)) return plan;
  const marker = plan.markers[index];
  if (!marker) return plan;
  const next = copyPlan(plan);
  const target = next.markers[index];
  if (!target) return plan;
  target.parameter = parameter;
  return next;
}

/** Ground circle for the spawn-plan limit. The first point is repeated to close the loop. */
export function limitRingPoints(limit: number, segments = 64): PlanVec3[] {
  const radius = Math.abs(limit);
  if (!Number.isFinite(radius) || radius === 0 || segments < 3) return [];
  const points: PlanVec3[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    points.push([Math.cos(angle) * radius, 0, Math.sin(angle) * radius]);
  }
  return points;
}

export function spawnPairLines(points: readonly PlanPointView[]): Array<[PlanVec3, PlanVec3]> {
  const first = new Map<number, PlanVec3>();
  for (const point of points) {
    if (point.id.kind === "spawnFirst") first.set(point.id.index, point.position);
  }
  const lines: Array<[PlanVec3, PlanVec3]> = [];
  for (const point of points) {
    if (point.id.kind !== "spawnSecond") continue;
    const start = first.get(point.id.index);
    if (start) lines.push([start, point.position]);
  }
  return lines;
}
