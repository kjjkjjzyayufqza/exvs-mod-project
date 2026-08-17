import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import { GutsBandChart } from "./GutsBandChart";

describe("GutsBandChart", () => {
  it("shows the engine-constant multiplier above 50% HP", () => {
    const entry = {
      lowDurabilityIncomingDamageMultiplierBand45To50: 80,
    } as TypedParamEntry;

    render(<GutsBandChart entry={entry} />);

    expect(screen.getByText("Band 50-100%")).toBeInTheDocument();
    expect(screen.getByText("x1.00")).toBeInTheDocument();
  });

  it("updates the active band and multiplier when the HP slider moves", () => {
    const entry = {
      lowDurabilityIncomingDamageMultiplierBand45To50: 80,
    } as TypedParamEntry;

    render(<GutsBandChart entry={entry} />);

    fireEvent.change(screen.getByLabelText("HP percentage"), {
      target: { value: "47" },
    });

    expect(screen.getByText("Band 45-50%")).toBeInTheDocument();
    expect(screen.getByText("x0.80")).toBeInTheDocument();
  });

  it("flags an absent active band as unavailable", () => {
    const entry = {
      lowDurabilityIncomingDamageMultiplierBand45To50: 80,
    } as TypedParamEntry;

    render(<GutsBandChart entry={entry} />);

    fireEvent.change(screen.getByLabelText("HP percentage"), {
      target: { value: "42" },
    });

    expect(screen.getByText("Band 40-45%")).toBeInTheDocument();
    expect(
      screen.getByText(
        "field unavailable (lowDurabilityIncomingDamageMultiplierBand40To45)",
      ),
    ).toBeInTheDocument();
  });

  it("renders an explicit panel-level unavailable state when no band fields exist", () => {
    render(<GutsBandChart entry={{} as TypedParamEntry} />);

    expect(
      screen.getByText(/no lowDurabilityIncomingDamageMultiplierBand/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("HP percentage")).not.toBeInTheDocument();
  });
});
