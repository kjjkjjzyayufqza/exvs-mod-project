import { describe, expect, it } from "vitest";
import type { TypedParamEntry } from "@/page/TestEditor/components/param-editor/typedParamTypes";
import {
  getBoostAscentParameters,
  getMovementCurves,
} from "./movementParamSemantics";

describe("movementParamSemantics", () => {
  const entry: TypedParamEntry = {
    groundWalkSpeedInitial: 10,
    groundWalkSpeedDelta: -1,
    groundWalkSpeedTerminal: 5,
    groundStepSpeedInitial: 20,
    groundStepSpeedDelta: -2,
    groundStepSpeedTerminal: 8,
    airStepSpeedInitial: 18,
    airStepSpeedDelta: -3,
    airStepSpeedTerminal: 6,
    boostDashSpeedInitial: 30,
    boostDashSpeedDelta: 2,
    boostDashSpeedTerminal: 40,
    boostAscentHorizontalSpeedInitial: 7,
    boostAscentHorizontalSpeedDelta: 1,
    boostAscentHorizontalSpeedTerminal: 12,
    transformForwardSpeedInitial: 50,
    transformForwardSpeedDelta: -4,
    transformForwardSpeedTerminal: 22,
    boostAscentVerticalSpeedInitial: 9,
    boostAscentVerticalSpeedTerminal: 15,
    boostAscentYawResponse: 3,
    boostAscentTurnTimeAngleScale: 6,
  };

  it("returns only consumer-confirmed initial/delta/terminal curves", () => {
    expect(getMovementCurves(entry)).toEqual([
      {
        id: "groundWalk",
        label: "Ground walk",
        initial: 10,
        delta: -1,
        terminal: 5,
        evidence: "A",
      },
      {
        id: "groundStep",
        label: "Ground step",
        initial: 20,
        delta: -2,
        terminal: 8,
        evidence: "A",
      },
      {
        id: "airStep",
        label: "Air step",
        initial: 18,
        delta: -3,
        terminal: 6,
        evidence: "A",
      },
      {
        id: "boostDash",
        label: "Boost dash",
        initial: 30,
        delta: 2,
        terminal: 40,
        evidence: "A",
      },
      {
        id: "boostAscentHorizontal",
        label: "Boost ascent (horizontal)",
        initial: 7,
        delta: 1,
        terminal: 12,
        evidence: "A",
      },
      {
        id: "transformForward",
        label: "Transform flight (forward)",
        initial: 50,
        delta: -4,
        terminal: 22,
        evidence: "A",
      },
    ]);
  });

  it("keeps ascent controls as raw parameters without inventing units", () => {
    expect(getBoostAscentParameters(entry)).toEqual({
      verticalInitial: 9,
      verticalTerminal: 15,
      yawResponse: 3,
      turnTimeAngleScale: 6,
      evidence: "A",
    });
  });
});
