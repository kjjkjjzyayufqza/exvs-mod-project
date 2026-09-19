import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StageDraft } from "@/services/triadRoute/types";
import { emptyUnitCatalog } from "./characterListUnitCatalog";
import { StageInspector } from "./StageInspector";

const loadedStage: StageDraft = {
  index: 2,
  sceneKey: 0x1111_2222,
  sceneName: "000triad_battle_a001_002",
  sceneNo: 2,
  scriptPackageHash: 0x67af_23fa,
  briefing: {
    sceneClass: 0,
    mapHash: 0,
    timeLimitSeconds: 180,
    hasTarget: false,
    bossSlots: [],
    units: [],
    slots: [],
  },
  script: {
    mapHash: 0,
    teamCosts: [],
    winFlags: 0,
    loseFlags: 0,
    targetCount: 0,
    allowedLosses: 0,
    bgmHash: 0,
    slots: [],
    openingSlots: [],
    waves: [],
  },
};

describe("StageInspector script extract", () => {
  beforeEach(() => {
    const elementPrototype = Element.prototype as Element & {
      hasPointerCapture?: (pointerId: number) => boolean;
      setPointerCapture?: (pointerId: number) => void;
      releasePointerCapture?: (pointerId: number) => void;
      scrollIntoView?: () => void;
    };
    elementPrototype.hasPointerCapture ??= () => false;
    elementPrototype.setPointerCapture ??= () => undefined;
    elementPrototype.releasePointerCapture ??= () => undefined;
    elementPrototype.scrollIntoView ??= () => undefined;
  });

  it("lets a loaded stage re-extract its own script after confirm", async () => {
    const user = userEvent.setup();
    const onExtractScript = vi.fn();

    render(
      <StageInspector
        stage={loadedStage}
        stages={[loadedStage]}
        units={emptyUnitCatalog()}
        pilots={[]}
        issues={[]}
        focus={null}
        onSelectStage={() => {}}
        onChangeStage={() => {}}
        onGenerateLineup={() => {}}
        scriptFolder="E:/XB/mod/051mission/000triad_battle_a001_002"
        scriptFolderExists
        onExtractScript={onExtractScript}
      />,
    );

    await user.click(screen.getByRole("button", { name: /re-extract this stage's script/i }));
    expect(onExtractScript).not.toHaveBeenCalled();

    expect(await screen.findByRole("alertdialog")).toHaveTextContent("000triad_battle_a001_002");
    await user.click(screen.getByRole("button", { name: /^re-extract$/i }));
    expect(onExtractScript).toHaveBeenCalledTimes(1);
  });

  it("unpacks a missing stage script without asking first", async () => {
    const user = userEvent.setup();
    const onExtractScript = vi.fn();

    render(
      <StageInspector
        stage={{ ...loadedStage, script: null }}
        stages={[{ ...loadedStage, script: null }]}
        units={emptyUnitCatalog()}
        pilots={[]}
        issues={[]}
        focus={null}
        onSelectStage={() => {}}
        onChangeStage={() => {}}
        onGenerateLineup={() => {}}
        scriptFolder="E:/XB/mod/051mission/000triad_battle_a001_002"
        scriptFolderExists={false}
        onExtractScript={onExtractScript}
      />,
    );

    await user.click(screen.getByRole("button", { name: /unpack this stage's script/i }));
    expect(onExtractScript).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
