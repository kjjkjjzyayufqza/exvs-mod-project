import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import { AmmoTimeline } from "./AmmoTimeline";

describe("AmmoTimeline", () => {
  it("shows RX-78-2 reload values as raw evidence without simulated rates", () => {
    const entry = {
      ammoCount: 8,
      reloadType: 2,
      reloadStartFrame: 120,
      reloadTimeTotal: 40,
      reloadPerShotFrame: 180,
      reloadLockFrame: 120,
      ammoReloadWaitFrame: 40,
      cooldownFrame: 120,
    } as TypedParamEntry;

    render(<AmmoTimeline entry={entry} />);

    expect(screen.getByText("Raw Reload Fields")).toBeInTheDocument();
    expect(screen.getByText("Type 2")).toBeInTheDocument();
    expect(screen.getByText("0xA502BCF2")).toBeInTheDocument();
    expect(screen.getByText("180f")).toBeInTheDocument();
    expect(screen.queryByText(/Shots\/sec/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Overheat/i)).not.toBeInTheDocument();
  });
});
