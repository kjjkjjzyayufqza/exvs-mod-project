import { describe, expect, it } from "vitest";
import type { PlanParam } from "../types/planParam";
import {
  limitRingPoints,
  listPlanPoints,
  movePlanPoint,
  parsePlanPointKey,
  setMarkerParameter,
  setPlanLimit,
  spawnPairLines,
} from "./planParamEdit";

function sample(): PlanParam {
  return {
    limit: 1000,
    limitPadding: 0,
    spawnPairs: [
      {
        first: [1, 2, 3, 1],
        second: [4, 5, 6, 3.5],
      },
    ],
    markers: [{ position: [7, 8, 9], parameter: Math.PI }],
    respawnPoints: [{ position: [10, 11, 12], padding: 0 }],
  };
}

describe("planParamEdit", () => {
  it("lists every record and keeps the trailing word beside xyz", () => {
    const points = listPlanPoints(sample());
    expect(points.map((point) => point.key)).toEqual([
      "spawnFirst:0",
      "spawnSecond:0",
      "marker:0",
      "respawn:0",
    ]);
    expect(points[1]?.trailing).toBe(3.5);
    expect(points[2]?.trailing).toBeCloseTo(Math.PI);
  });

  it("moves xyz without clearing a 3.5 spawn word or a marker angle", () => {
    const moved = movePlanPoint(sample(), { kind: "spawnSecond", index: 0 }, [20, 21, 22]);
    expect(moved.spawnPairs[0]?.second).toEqual([20, 21, 22, 3.5]);
    expect(moved.spawnPairs[0]?.first).toEqual([1, 2, 3, 1]);
    const angled = movePlanPoint(moved, { kind: "marker", index: 0 }, [0, 1, 2]);
    expect(angled.markers[0]).toEqual({ position: [0, 1, 2], parameter: Math.PI });
    expect(sample().spawnPairs[0]?.second[3]).toBe(3.5);
  });

  it("rejects a point key that is not one of the four record kinds", () => {
    expect(parsePlanPointKey("spawnSecond:1")).toEqual({ kind: "spawnSecond", index: 1 });
    expect(parsePlanPointKey("border:0")).toBeNull();
    expect(parsePlanPointKey("respawn:-1")).toBeNull();
  });

  it("keeps the limit padding when the limit changes", () => {
    const next = setPlanLimit(sample(), 3000);
    expect(next.limit).toBe(3000);
    expect(next.limitPadding).toBe(0);
    expect(setPlanLimit(sample(), Number.NaN).limit).toBe(1000);
  });

  it("writes a marker angle without moving the marker or the spawn word", () => {
    const next = setMarkerParameter(sample(), 0, Math.PI / 2);
    expect(next.markers[0]).toEqual({ position: [7, 8, 9], parameter: Math.PI / 2 });
    expect(next.spawnPairs[0]?.second[3]).toBe(3.5);
    const original = sample();
    expect(setMarkerParameter(original, 3, 1)).toBe(original);
  });

  it("closes the limit ring and links a spawn pair", () => {
    const ring = limitRingPoints(1000, 4);
    expect(ring).toHaveLength(5);
    expect(ring[0]?.[0]).toBeCloseTo(1000);
    expect(ring.at(-1)?.[0]).toBeCloseTo(ring[0]?.[0] ?? 0);
    expect(ring.at(-1)?.[2]).toBeCloseTo(ring[0]?.[2] ?? 0);
    expect(limitRingPoints(0)).toEqual([]);
    const lines = spawnPairLines(listPlanPoints(sample()));
    expect(lines).toEqual([[[1, 2, 3], [4, 5, 6]]]);
  });
});
