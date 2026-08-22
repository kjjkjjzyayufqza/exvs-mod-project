import { describe, expect, it } from "vitest";
import {
  efxbnDataToPixel,
  efxbnPixelToData,
  evaluateEfxbnCurve,
  findEfxbnKeyAtProgress,
  fitEfxbnValueRange,
  frameToEfxbnProgress,
  initialEfxbnGraphView,
  insertSampledEfxbnKey,
  progressToEfxbnFrame,
} from "./efxbnCurveMath";

describe("EFXBN curve time conversion", () => {
  it("round-trips frame and native progress", () => {
    expect(progressToEfxbnFrame(20, 250)).toBe(50);
    expect(frameToEfxbnProgress(50, 250)).toBe(20);
  });

  it("returns null when a frame window cannot be derived", () => {
    expect(progressToEfxbnFrame(20, 0)).toBeNull();
    expect(frameToEfxbnProgress(50, 0)).toBeNull();
  });
});

describe("EFXBN linear evaluation", () => {
  const keys = [
    { key: 0, value: 1 },
    { key: 100, value: 3 },
  ];

  it("clamps before and after the authored range", () => {
    expect(evaluateEfxbnCurve(keys, -10)).toBe(1);
    expect(evaluateEfxbnCurve(keys, 120)).toBe(3);
  });

  it("linearly interpolates between keys", () => {
    expect(evaluateEfxbnCurve(keys, 25)).toBe(1.5);
  });

  it("inserts a sampled key without changing the curve shape", () => {
    const next = insertSampledEfxbnKey(keys, 25);
    expect(next).toEqual([
      { key: 0, value: 1 },
      { key: 25, value: 1.5 },
      { key: 100, value: 3 },
    ]);
    expect(evaluateEfxbnCurve(next, 60)).toBe(evaluateEfxbnCurve(keys, 60));
  });

  it("finds a key using a small progress tolerance", () => {
    expect(findEfxbnKeyAtProgress(keys, 100.000001)).toBe(1);
    expect(findEfxbnKeyAtProgress(keys, 50)).toBeNull();
  });
});

describe("EFXBN graph coordinates", () => {
  it("pads a flat value range so a constant remains visible", () => {
    expect(fitEfxbnValueRange([[{ key: 0, value: 2 }]])).toEqual({ min: 1, max: 3 });
  });

  it("maps data coordinates to SVG and back", () => {
    const view = { progressMin: 0, progressMax: 100, valueMin: -2, valueMax: 2 };
    const pixel = efxbnDataToPixel({ key: 25, value: 1 }, view, 800, 400);
    const data = efxbnPixelToData(pixel, view, 800, 400);
    expect(data.key).toBeCloseTo(25);
    expect(data.value).toBeCloseTo(1);
  });

  it("fits authored keys outside the normal playback band", () => {
    expect(
      initialEfxbnGraphView([
        [{ key: -20, value: -1 }, { key: 140, value: 3 }],
      ]),
    ).toEqual({ progressMin: -20, progressMax: 140, valueMin: -1.32, valueMax: 3.32 });
  });
});
