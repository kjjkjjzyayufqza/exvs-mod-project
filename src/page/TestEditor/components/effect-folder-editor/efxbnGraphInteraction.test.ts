import { describe, expect, it } from "vitest";
import {
  boxSelectEfxbnKeys,
  moveEfxbnSelectedKeys,
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
