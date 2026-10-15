/** Over Boost `info/plan_param.spbin`, matching `parse_plan_param`. */

export type PlanVec3 = [number, number, number];
export type PlanVec4 = [number, number, number, number];

export type PlanParam = {
  limit: number;
  limitPadding: number;
  spawnPairs: Array<{ first: PlanVec4; second: PlanVec4 }>;
  markers: Array<{ position: PlanVec3; parameter: number }>;
  respawnPoints: Array<{ position: PlanVec3; padding: number }>;
};

/** Container facts from `info/border_hit.hkt`. Mesh triangles are not decoded. */
export type BorderHitSummary = {
  sdkVersion: string;
  byteLen: number;
  dataLen: number;
  itemCount: number;
  typeChunks: string[];
};

export type PlanPointKind = "spawnFirst" | "spawnSecond" | "marker" | "respawn";

export type PlanPointId = {
  kind: PlanPointKind;
  index: number;
};

export type PlanPointView = {
  id: PlanPointId;
  key: string;
  position: PlanVec3;
  /** Spawn `w`, marker parameter, or respawn padding. Editing xyz leaves this alone. */
  trailing: number;
};
