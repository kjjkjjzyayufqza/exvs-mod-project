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

    expect(screen.getByText("Reload schema fields")).toBeInTheDocument();
    expect(screen.getByText("0xA502BCF2")).toBeInTheDocument();
    expect(screen.getByText("reloadPerShotFrame")).toBeInTheDocument();
    expect(screen.getByText("180f (3.00s)")).toBeInTheDocument();
    expect(screen.getByText("ammoCount")).toBeInTheDocument();
    expect(screen.getByText("overheatFrame")).toBeInTheDocument();
    expect(screen.queryByText(/Shots\/sec/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/simulated/i)).not.toBeInTheDocument();
  });
});
