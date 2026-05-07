import { describe, it, expect } from "vitest";
import {
  ballisticAngleSolver,
  ballisticTrajectoryMidpoint,
} from "./ballisticSolver";
import type { Vec3 } from "./vec3";

describe("ballisticAngleSolver", () => {
  it("returns angle clamped to maxAngle for high arc", () => {
    const source: Vec3 = [0, 0, 0];
    const target: Vec3 = [0, 0, 100];
    const angle = ballisticAngleSolver(source, target, 50, 0.5, true);
    expect(angle).toBeLessThanOrEqual(1.5);
    expect(angle).toBeGreaterThan(0);
  });

  it("returns angle clamped to maxAngle for low arc", () => {
    const source: Vec3 = [0, 0, 0];
    const target: Vec3 = [0, 0, 100];
    const angle = ballisticAngleSolver(source, target, 50, 0.5, false);
    expect(angle).toBeLessThanOrEqual(0.8);
  });

  it("handles zero distance without crashing", () => {
    const source: Vec3 = [0, 0, 0];
    const target: Vec3 = [0, 0, 0];
    const angle = ballisticAngleSolver(source, target, 50, 0.5, true);
    expect(Number.isFinite(angle)).toBe(true);
  });
});

describe("ballisticTrajectoryMidpoint", () => {
  it("midpoint XZ is average of source and target", () => {
    const source: Vec3 = [0, 0, 0];
    const target: Vec3 = [100, 0, 200];
    const mid = ballisticTrajectoryMidpoint(source, target, 0.5, 10);
    expect(mid[0]).toBeCloseTo(50);
    expect(mid[2]).toBeCloseTo(100);
  });

  it("peak height uses turnRate in numerator, gravityRate in denominator", () => {
    const source: Vec3 = [0, 0, 0];
    const target: Vec3 = [0, 0, 100];

    const midA = ballisticTrajectoryMidpoint(source, target, 0.5, 10);
    const midB = ballisticTrajectoryMidpoint(source, target, 0.5, 20);

    // Doubling turnRate (speed) should increase peak height (roughly 4x for squared term)
    expect(midB[1]).toBeGreaterThan(midA[1]);
  });

  it("peak height changes when gravityRate changes but turnRate stays same", () => {
    const source: Vec3 = [0, 0, 0];
    const target: Vec3 = [0, 0, 100];

    const midLowG = ballisticTrajectoryMidpoint(source, target, 0.2, 10);
    const midHighG = ballisticTrajectoryMidpoint(source, target, 1.0, 10);

    // Higher gravity → lower peak (larger denominator)
    expect(midHighG[1]).toBeLessThan(midLowG[1]);
  });

  it("peak height is independent: changing only turnRate affects numerator, not denominator", () => {
    const source: Vec3 = [0, 10, 0];
    const target: Vec3 = [0, 10, 50];
    const gravity = 0.3;

    const mid1 = ballisticTrajectoryMidpoint(source, target, gravity, 5);
    const mid2 = ballisticTrajectoryMidpoint(source, target, gravity, 15);

    // Peak height formula: (sin(angle) * turnRate)² / (2 * gravity)
    // With same gravity but different turnRate, heights must differ significantly
    const height1 = mid1[1] - 10;
    const height2 = mid2[1] - 10;
    expect(height2).toBeGreaterThan(height1 * 2);
  });
});
