import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import { AmmoTimeline } from "./AmmoTimeline";

describe("AmmoTimeline", () => {
  it("shows canonical native fields without legacy combat labels", () => {
    const entry = {
      ammoCount: 8,
      initialAmmoCount: 0,
      slotIndex: 2,
      behaviorFlags: 1,
      reloadBehaviorType: 2,
      reloadGroupBEnabled: 0,
      chargeInputFlags: 1,
      chargeStageCount: 2,
      chargeAccumulateDurationDefaultFrame: 180,
      chargeAccumulateDurationBaseFrame: 120,
      chargeAccumulateDurationMode1Scale: 0.75,
      chargeDecayDurationDefaultFrame: 60,
      chargeDecayDurationBaseFrame: 60,
      chargeDecayDurationMode1Scale: 0.5,
      reloadAuxGroupA: 0,
      reloadDurationGroupADefault: 180,
      reloadDurationGroupAMode1: 180,
      reloadDurationGroupAMode2: 180,
      reloadDurationGroupAMode3: 180,
      reloadDurationGroupAMode4: 180,
      reloadDurationGroupAMode5: 180,
      reloadAuxGroupB: 0,
      reloadDurationGroupBDefault: 180,
      reloadDurationGroupBMode1: 180,
      reloadDurationGroupBMode2: 180,
      reloadDurationGroupBMode3: 180,
      reloadDurationGroupBMode4: 180,
      reloadDurationGroupBMode5: 180,
    } as TypedParamEntry;

    render(<AmmoTimeline entry={entry} />);

    expect(
      screen.getByText("Native ammo, charge, and reload fields"),
    ).toBeInTheDocument();
    expect(screen.getByText("0x4E692ACD")).toBeInTheDocument();
    expect(screen.getByText("initialAmmoCount")).toBeInTheDocument();
    expect(screen.getByText("0xAB9AEF6C")).toBeInTheDocument();
    expect(screen.getByText("slotIndex")).toBeInTheDocument();
    expect(screen.getByText("reloadDurationGroupADefault")).toBeInTheDocument();
    expect(screen.getByText("chargeInputFlags")).toBeInTheDocument();
    expect(screen.getByText("chargeStageCount")).toBeInTheDocument();
    expect(
      screen.getByText("chargeAccumulateDurationDefaultFrame"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("180f (3.00s)").length).toBeGreaterThan(0);
    expect(screen.queryByText("downValue")).not.toBeInTheDocument();
    expect(screen.queryByText("damage")).not.toBeInTheDocument();
    expect(screen.queryByText("overheatFrame")).not.toBeInTheDocument();
  });
});
