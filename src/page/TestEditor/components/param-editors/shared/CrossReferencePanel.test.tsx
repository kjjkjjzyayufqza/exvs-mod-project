import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CrossReference } from "@/lib/gameAlgorithms/crossParamResolver";
import { CrossReferencePanel } from "./CrossReferencePanel";

function makeReference(
  overrides: Partial<CrossReference> & Pick<CrossReference, "sourceField" | "targetKind" | "targetHash">,
): CrossReference {
  return {
    sourceKind: "bulletparam",
    sourceEntryId: 0x1000,
    targetEntry: undefined,
    ...overrides,
  };
}

describe("CrossReferencePanel", () => {
  it("shows the empty state when there are no references", () => {
    render(<CrossReferencePanel references={[]} />);
    expect(screen.getByText("No cross-references")).toBeInTheDocument();
  });

  it("distinguishes not-loaded kinds from missing entries in loaded kinds", () => {
    const references = [
      makeReference({
        sourceField: "hitEffectHash",
        targetKind: "interactionid",
        targetHash: 0x10,
      }),
      makeReference({
        sourceField: "hitgroupHash",
        targetKind: "hitgroupiddef",
        targetHash: 0x20,
      }),
    ];

    render(
      <CrossReferencePanel
        references={references}
        loadedKinds={["hitgroupiddef"]}
      />,
    );

    // interactionid file is not loaded at all.
    expect(screen.getByText("Not loaded")).toBeInTheDocument();
    // hitgroupiddef is loaded but the hash is absent from it.
    expect(screen.getByText("Missing entry")).toBeInTheDocument();
  });

  it("renders Open only for navigable kinds and forwards the navigation target", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const references = [
      makeReference({
        sourceField: "childBulletHash",
        targetKind: "bulletparam",
        targetHash: 0x30,
        targetEntry: { entryId: 0x30 },
      }),
      makeReference({
        sourceField: "hitEffectHash",
        targetKind: "interactionid",
        targetHash: 0x40,
        targetEntry: { entryId: 0x40 },
      }),
    ];

    render(
      <CrossReferencePanel
        references={references}
        loadedKinds={["bulletparam", "interactionid"]}
        navigableKinds={["bulletparam"]}
        onNavigateToEntry={onNavigate}
      />,
    );

    const openButtons = screen.getAllByRole("button", { name: /open/i });
    expect(openButtons).toHaveLength(1);

    await user.click(openButtons[0]!);
    expect(onNavigate).toHaveBeenCalledWith("bulletparam", 0x30);
  });
});
