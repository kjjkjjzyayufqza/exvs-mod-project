import { describe, expect, it } from "vitest";
import {
  classifyShootingEndReason,
  simulateShootingLoop,
  type ShootingTrajectorySummary,
} from "./shootingLoop";
import type { TypedParamEntry } from "@/page/TestEditor/components/param-editor/typedParamTypes";

function arms(overrides: TypedParamEntry = {}): TypedParamEntry {
  return {
    entryId: 0x100,
    startupFrame: 12,
    activeFrame: 8,
    recoveryFrame: 18,
    cooldownFrame: 30,
    ammoCount: 5,
    bulletCountPerShot: 1,
    firingIntervalFrame: 4,
    ...overrides,
  };
}

function bullet(overrides: TypedParamEntry = {}): TypedParamEntry {
  return {
    entryId: 0x200,
    moveType: 0,
    lifetime: 60,
    effectiveRange: 0,
    maxRange: 2,
    ...overrides,
  };
}

function trajectory(
  overrides: Partial<ShootingTrajectorySummary> = {},
): ShootingTrajectorySummary {
  return {
    totalFrames: 60,
    hitFrame: 60,
    ...overrides,
  };
}

describe("simulateShootingLoop", () => {
  it("spawns a single bullet at the startup frame", () => {
    const result = simulateShootingLoop({
      armsEntry: arms(),
      bulletEntry: bullet(),
      scenario: { targetDistance: 30 },
      simulateTrajectory: () => trajectory(),
    });

    expect(result.timeline.startupFrame).toBe(12);
    expect(result.timeline.activeEndFrame).toBe(20);
    expect(result.timeline.recoveryEndFrame).toBe(38);
    expect(result.timeline.cooldownEndFrame).toBe(68);
    expect(result.spawnFrames).toEqual([12]);
    expect(result.shots).toHaveLength(1);
    expect(result.shots[0]!.spawnFrame).toBe(12);
    expect(result.shots[0]!.endFrame).toBe(72);
    expect(result.shots[0]!.endReason).toBe("lifetime");
  });

  it("uses bulletCountPerShot and firingIntervalFrame for multi-shot bursts", () => {
    const result = simulateShootingLoop({
      armsEntry: arms({ bulletCountPerShot: 3, firingIntervalFrame: 5 }),
      bulletEntry: bullet(),
      scenario: { targetDistance: 30 },
      simulateTrajectory: () => trajectory({ totalFrames: 20, hitFrame: 20 }),
    });

    expect(result.spawnFrames).toEqual([12, 17, 22]);
    expect(result.shots.map((shot) => shot.endFrame)).toEqual([32, 37, 42]);
  });

  it("does not spawn more bullets than available ammo", () => {
    const result = simulateShootingLoop({
      armsEntry: arms({ ammoCount: 2, bulletCountPerShot: 4, firingIntervalFrame: 3 }),
      bulletEntry: bullet(),
      scenario: { targetDistance: 30 },
      simulateTrajectory: () => trajectory(),
    });

    expect(result.spawnFrames).toEqual([12, 15]);
    expect(result.ammoAfterFire).toBe(0);
  });

  it("marks a shot as hit when trajectory hitFrame occurs before the trajectory ends", () => {
    const result = simulateShootingLoop({
      armsEntry: arms(),
      bulletEntry: bullet(),
      scenario: { targetDistance: 30 },
      simulateTrajectory: () => trajectory({ totalFrames: 60, hitFrame: 18 }),
    });

    expect(result.shots[0]!.endReason).toBe("hit");
    expect(result.shots[0]!.endFrame).toBe(30);
  });

  it("marks early trajectory termination as effectiveRange when the bullet has a range limit", () => {
    const result = simulateShootingLoop({
      armsEntry: arms(),
      bulletEntry: bullet({ lifetime: 90, effectiveRange: 40 }),
      scenario: { targetDistance: 30 },
      simulateTrajectory: () => trajectory({ totalFrames: 24, hitFrame: 24 }),
    });

    expect(result.shots[0]!.endReason).toBe("effectiveRange");
    expect(result.shots[0]!.endFrame).toBe(36);
  });
});

describe("classifyShootingEndReason", () => {
  it("classifies lifetime when trajectory consumes the bullet lifetime", () => {
    expect(
      classifyShootingEndReason({
        trajectory: trajectory({ totalFrames: 60, hitFrame: 60 }),
        bulletEntry: bullet({ lifetime: 60 }),
      }),
    ).toBe("lifetime");
  });

  it("classifies unknown when an early stop has no hit or range signal", () => {
    expect(
      classifyShootingEndReason({
        trajectory: trajectory({ totalFrames: 20, hitFrame: 20 }),
        bulletEntry: bullet({ lifetime: 60, effectiveRange: 0 }),
      }),
    ).toBe("unknown");
  });
});
