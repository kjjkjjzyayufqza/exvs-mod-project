import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import { LockRangeRings } from "./LockRangeRings";

describe("LockRangeRings", () => {
  it("lists every family-1 selector with its value or unavailable marker", () => {
    const entry = {
      lockDistanceThresholdFamily1Slot0: 300,
      lockDistanceThresholdFamily1Default: 550,
    } as TypedParamEntry;

    render(<LockRangeRings entry={entry} />);

    expect(screen.getByText("Slot 0")).toBeInTheDocument();
    expect(screen.getByText("300")).toBeInTheDocument();
    expect(screen.getByText("Default")).toBeInTheDocument();
    expect(screen.getByText("550")).toBeInTheDocument();
    // Slots 1-4 are absent from the entry.
    expect(screen.getAllByText("unavailable").length).toBe(4);
  });

  it("shows the lockOnFovAngle overlay note when the field is present", () => {
    const entry = {
      lockDistanceThresholdFamily1Slot0: 300,
      lockOnFovAngle: 60,
    } as TypedParamEntry;

    render(<LockRangeRings entry={entry} />);

    expect(
      screen.getByText(/lockOnFovAngle: 60 deg/),
    ).toBeInTheDocument();
  });

  it("renders an explicit panel-level unavailable state when no fields exist", () => {
    render(<LockRangeRings entry={{} as TypedParamEntry} />);

    expect(
      screen.getByText(/no lockDistanceThresholdFamily1 fields/),
    ).toBeInTheDocument();
  });
});
