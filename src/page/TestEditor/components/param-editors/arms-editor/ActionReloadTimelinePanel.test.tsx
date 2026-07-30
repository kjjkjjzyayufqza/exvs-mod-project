import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import { ActionReloadTimelinePanel } from "./ActionReloadTimelinePanel";

describe("ActionReloadTimelinePanel", () => {
  it("renders action phases and raw reload segments from the entry frames", () => {
    const entry = {
      startupFrame: 10,
      activeFrame: 20,
      recoveryFrame: 15,
      cooldownFrame: 30,
      totalDurationFrame: 75,
      landingRecoveryFrame: 12,
      ammoCount: 8,
      reloadType: 2,
      reloadTimeTotal: 40,
      reloadPerShotFrame: 180,
      overheatFrame: 0,
      chargeFrame: 0,
      fullChargeFrame: 0,
    } as TypedParamEntry;

    render(<ActionReloadTimelinePanel entry={entry} />);

    expect(screen.getByText("Action Timeline")).toBeInTheDocument();
    expect(screen.getByText("75f (1.25s)")).toBeInTheDocument();
    expect(screen.getByText("Startup:")).toBeInTheDocument();
    expect(screen.getByText("Cooldown:")).toBeInTheDocument();

    expect(screen.getByText("Raw Reload Timeline")).toBeInTheDocument();
    expect(screen.getByText("0x103171AE:")).toBeInTheDocument();
    expect(screen.getByText("0xA502BCF2:")).toBeInTheDocument();
    expect(screen.getByText("180f")).toBeInTheDocument();

    expect(screen.getByText("Type 2 (unverified)")).toBeInTheDocument();
    expect(screen.getByText("12f")).toBeInTheDocument();
  });

  it("shows an explicit empty state when no reload frame fields are set", () => {
    const entry = {
      startupFrame: 5,
      activeFrame: 5,
      recoveryFrame: 5,
      cooldownFrame: 5,
      reloadType: 0,
      reloadTimeTotal: 0,
      reloadPerShotFrame: 0,
      overheatFrame: 0,
      chargeFrame: 0,
    } as TypedParamEntry;

    render(<ActionReloadTimelinePanel entry={entry} />);

    expect(
      screen.getByText("Raw Reload Timeline: no timeline data"),
    ).toBeInTheDocument();
  });

  it("labels reload types outside the known 0-3 range explicitly", () => {
    const entry = {
      startupFrame: 1,
      activeFrame: 1,
      recoveryFrame: 1,
      cooldownFrame: 1,
      reloadType: 9,
      reloadTimeTotal: 30,
    } as TypedParamEntry;

    render(<ActionReloadTimelinePanel entry={entry} />);

    expect(
      screen.getByText("Type 9 (outside known 0-3 range)"),
    ).toBeInTheDocument();
  });
});
