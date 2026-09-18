import { describe, expect, it } from "vitest";
import {
  boxSelectEfxbnKeys,
  deleteEfxbnSelectedKeys,
  inspectorChannelName,
  mergeEfxbnPastedKeys,
  moveEfxbnSelectedKeys,
  offsetEfxbnCopiedKeys,
  selectEfxbnChannelKeys,
  toggleEfxbnKeySelection,
  type EfxbnGraphKeyRef,
} from "./efxbnGraphInteraction";

describe("EFXBN graph selection", () => {
  const red: EfxbnGraphKeyRef = { controlName: "colorR", sourceKey: 0 };
  const green: EfxbnGraphKeyRef = { controlName: "colorG", sourceKey: 20 };

  it("replaces or toggles selection", () => {
    expect(toggleEfxbnKeySelection([], red, false)).toEqual([red]);
    expect(toggleEfxbnKeySelection([red], green, true)).toEqual([red, green]);
    expect(toggleEfxbnKeySelection([red, green], red, true)).toEqual([green]);
  });

  it("box-selects visible key coordinates", () => {
    const result = boxSelectEfxbnKeys(
      [
        { ref: red, x: 20, y: 20 },
        { ref: green, x: 90, y: 90 },
      ],
      { left: 0, top: 0, right: 50, bottom: 50 },
    );
    expect(result).toEqual([red]);
  });

  it("selects the nearest key for a channel click, or every key with all-mode", () => {
    const keys = [
      { key: 0, value: 1 },
      { key: 100, value: 0.5 },
    ];
    expect(
      selectEfxbnChannelKeys({
        controlName: "colorR",
        keys,
        progress: 80,
        mode: "nearest",
        current: [],
        additive: false,
      }),
    ).toEqual([{ controlName: "colorR", sourceKey: 100 }]);
    expect(
      selectEfxbnChannelKeys({
        controlName: "colorR",
        keys,
        progress: 0,
        mode: "all",
        current: [green],
        additive: true,
      }),
    ).toEqual([
      green,
      { controlName: "colorR", sourceKey: 0 },
      { controlName: "colorR", sourceKey: 100 },
    ]);
  });

  it("keeps one key when a delete would empty a channel", () => {
    const result = deleteEfxbnSelectedKeys({
      curves: { spawnForm0: [{ key: 0, value: 2 }] },
      selected: [{ controlName: "spawnForm0", sourceKey: 0 }],
    });
    expect(result.keptLastKey).toBe(true);
    expect(result.replacements).toEqual([]);
  });

  it("pastes copied keys onto a target progress", () => {
    const moved = offsetEfxbnCopiedKeys([{ key: 0, value: 1 }, { key: 20, value: 2 }], 0, 50);
    expect(moved).toEqual([{ key: 50, value: 1 }, { key: 70, value: 2 }]);
    expect(mergeEfxbnPastedKeys([{ key: 0, value: 4 }], moved)).toEqual([
      { key: 0, value: 4 },
      { key: 50, value: 1 },
      { key: 70, value: 2 },
    ]);
  });

  it("names the inspector after the selected channel, not only graph focus", () => {
    expect(inspectorChannelName([], "colorR")).toBe("colorR");
    expect(inspectorChannelName([{ controlName: "spawnForm0", sourceKey: 0 }], "colorR")).toBe("spawnForm0");
    expect(
      inspectorChannelName(
        [
          { controlName: "spawnForm0", sourceKey: 0 },
          { controlName: "spreadX", sourceKey: 0 },
        ],
        "colorR",
      ),
    ).toBe("mixed");
  });
});

describe("EFXBN graph dragging", () => {
  it("moves selected keys across channels and snaps to frames", () => {
    const replacements = moveEfxbnSelectedKeys({
      curves: {
        colorR: [{ key: 0, value: 1 }, { key: 100, value: 0.5 }],
        colorG: [{ key: 0, value: 1.75 }, { key: 100, value: 1.25 }],
      },
      selected: [
        { controlName: "colorR", sourceKey: 100 },
        { controlName: "colorG", sourceKey: 100 },
      ],
      deltaProgress: -9.8,
      deltaValue: 0.25,
      frameCount: 100,
      snapToFrame: true,
    });
    expect(replacements).toEqual([
      { controlName: "colorR", keys: [{ key: 0, value: 1 }, { key: 90, value: 0.75 }] },
      { controlName: "colorG", keys: [{ key: 0, value: 1.75 }, { key: 90, value: 1.5 }] },
    ]);
  });

  it("refuses a drag that collides with an unselected key", () => {
    expect(() =>
      moveEfxbnSelectedKeys({
        curves: { colorR: [{ key: 0, value: 1 }, { key: 50, value: 2 }] },
        selected: [{ controlName: "colorR", sourceKey: 50 }],
        deltaProgress: -50,
        deltaValue: 0,
        frameCount: 100,
        snapToFrame: true,
      }),
    ).toThrow(/duplicate progress/);
  });
});
