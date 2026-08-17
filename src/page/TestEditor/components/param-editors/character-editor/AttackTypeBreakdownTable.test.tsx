import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import { AttackTypeBreakdownTable } from "./AttackTypeBreakdownTable";

describe("AttackTypeBreakdownTable", () => {
  it("shows computed damage and cost for canonical fields", () => {
    const entry = {
      mainShotDamage: 123,
      mainShotCost: 17,
      subShotDamage: 200,
    } as TypedParamEntry;

    render(<AttackTypeBreakdownTable entry={entry} />);

    expect(screen.getByText("Main shot")).toBeInTheDocument();
    // Attack types 0 and 1 both read mainShotDamage.
    expect(screen.getAllByText("123").length).toBe(2);
    expect(screen.getByText("17")).toBeInTheDocument();
    expect(screen.getByText("Sub shot (no correction)")).toBeInTheDocument();
  });

  it("marks absent fields as unavailable instead of showing zero", () => {
    const entry = { mainShotDamage: 123 } as TypedParamEntry;

    render(<AttackTypeBreakdownTable entry={entry} />);

    const meleeRow = screen.getByText("Melee").closest("tr");
    expect(meleeRow).not.toBeNull();
    // Both meleeDamage and specialCost are absent from the entry.
    expect(within(meleeRow as HTMLElement).getAllByText("unavailable").length).toBe(2);
    expect(within(meleeRow as HTMLElement).queryByText("0")).not.toBeInTheDocument();
  });

  it("recomputes corrected damage when the correction rate changes", () => {
    const entry = { subShotDamage: 200 } as TypedParamEntry;

    render(<AttackTypeBreakdownTable entry={entry} />);

    fireEvent.change(screen.getByLabelText("Correction rate"), {
      target: { value: "0.5" },
    });

    // Cases 4/5/12 show trunc(200 * 0.5); case 13 keeps the raw 200.
    expect(screen.getAllByText("100").length).toBe(3);
    expect(screen.getByText("200")).toBeInTheDocument();
  });
});
