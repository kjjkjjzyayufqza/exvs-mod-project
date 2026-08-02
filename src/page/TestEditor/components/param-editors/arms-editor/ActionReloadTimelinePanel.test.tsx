import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import { ActionReloadTimelinePanel } from "./ActionReloadTimelinePanel";

function entry(overrides: TypedParamEntry = {}): TypedParamEntry {
  return {
    ammoCount: 8,
    initialAmmoCount: 0,
    slotIndex: 2,
    behaviorFlags: 6,
    reloadBehaviorType: 2,
    reloadGroupBEnabled: 1,
    chargeInputFlags: 1,
    chargeStageCount: 3,
    chargeAccumulateDurationDefaultFrame: 180,
    chargeAccumulateDurationBaseFrame: 120,
    chargeAccumulateDurationMode1Scale: 0.5,
    chargeAccumulateDurationMode2Scale: 1,
    chargeAccumulateDurationMode3Scale: 1.5,
    chargeAccumulateDurationMode4Scale: 2,
    chargeAccumulateDurationMode5Scale: 2.5,
    chargeDecayDurationDefaultFrame: 60,
    chargeDecayDurationBaseFrame: 60,
    chargeDecayDurationMode1Scale: 0.5,
    chargeDecayDurationMode2Scale: 1,
    chargeDecayDurationMode3Scale: 1.5,
    chargeDecayDurationMode4Scale: 2,
    chargeDecayDurationMode5Scale: 2.5,
    reloadAuxGroupA: 0,
    reloadDurationGroupADefault: 180,
    reloadDurationGroupAMode1: 181,
    reloadDurationGroupAMode2: 182,
    reloadDurationGroupAMode3: 183,
    reloadDurationGroupAMode4: 184,
    reloadDurationGroupAMode5: 185,
    reloadAuxGroupB: 0,
    reloadDurationGroupBDefault: 270,
    reloadDurationGroupBMode1: 271,
    reloadDurationGroupBMode2: 272,
    reloadDurationGroupBMode3: 273,
    reloadDurationGroupBMode4: 274,
    reloadDurationGroupBMode5: 275,
    ...overrides,
  };
}

describe("ActionReloadTimelinePanel", () => {
  it("renders native ammo, CSA stages, charge timing, and reload selectors", () => {
    render(<ActionReloadTimelinePanel entry={entry()} />);

    expect(screen.getByText("Capacity / initial")).toBeInTheDocument();
    expect(screen.getByText("8 / 0")).toBeInTheDocument();
    expect(screen.getByText("Native slot")).toBeInTheDocument();
    expect(screen.getByText("Type 2 (step refill)")).toBeInTheDocument();
    expect(screen.getByText("CSA (shooting CS)")).toBeInTheDocument();
    expect(screen.getByText("Charge stages and timing")).toBeInTheDocument();
    expect(screen.getByText("Charge / stage")).toBeInTheDocument();
    expect(screen.getByText("Charge to max")).toBeInTheDocument();
    expect(screen.getAllByText("default")).toHaveLength(2);
    expect(screen.getAllByText("mode 5")).toHaveLength(2);
    expect(screen.getAllByText("180f (3.00s)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("540f (9.00s)").length).toBeGreaterThan(0);
    expect(screen.getByText("270f (4.50s)")).toBeInTheDocument();
  });

  it("labels reload behavior values outside the native 0-5 switch", () => {
    render(
      <ActionReloadTimelinePanel entry={entry({ reloadBehaviorType: 9 })} />,
    );

    expect(
      screen.getByText("Type 9 (outside native 0-5 range)"),
    ).toBeInTheDocument();
  });
});
