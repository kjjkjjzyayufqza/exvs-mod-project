// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { EffectFolderPreviewPlan } from "./effectFolderPreviewPlan";
import { EfxbnPreviewInspector } from "./EfxbnPreviewInspector";
import { makeEfxbnEffectBlock } from "./efxbnTestFactory";

function makePlan(): EffectFolderPreviewPlan {
  return {
    kind: "efxbn",
    key: "layout-test",
    targets: [],
    localAnimationCount: 0,
    unresolvedModelHashes: [],
    unresolvedAnimationHashes: [],
    unresolvedTextureHashes: [],
    textureParameters: [],
    textureBindings: [],
    localTextureCount: 0,
    commonModelCount: 0,
    commonTextureCount: 0,
    effectBlocks: [makeEfxbnEffectBlock({ index: 0, effectType: 9 })],
    controlLookupEntries: [],
  };
}

const paneProps = {
  plan: makePlan(),
  progress: 0,
  selectedEffectIndex: 0,
  hiddenEffectIndexes: new Set<number>(),
  onSelectEffect: vi.fn(),
  onSetEffectVisible: vi.fn(),
  onShowAll: vi.fn(),
  onSolo: vi.fn(),
};

describe("EfxbnPreviewInspector layout panes", () => {
  it("keeps the block outliner and property editor in separate panes", () => {
    render(
      <>
        <EfxbnPreviewInspector pane="outliner" {...paneProps} />
        <EfxbnPreviewInspector pane="properties" {...paneProps} />
      </>,
    );

    const outliner = screen.getByRole("complementary", { name: "EFXBN block outliner" });
    const properties = screen.getByRole("complementary", { name: "EFXBN properties" });

    expect(within(outliner).getByRole("button", { name: "Show all EFXBN blocks" })).toBeInTheDocument();
    expect(within(outliner).queryByRole("tab", { name: "Block" })).toBeNull();
    expect(within(properties).getByRole("tab", { name: "Block" })).toBeInTheDocument();
    expect(within(properties).queryByRole("button", { name: "Show all EFXBN blocks" })).toBeNull();
    expect(within(properties).getByText("Block 00")).toBeInTheDocument();
  });
});
