import { EFXBN_KEY_EPSILON, type EfxbnCurveKey } from "./efxbnDocument";

export type EfxbnGraphView = {
  progressMin: number;
  progressMax: number;
  valueMin: number;
  valueMax: number;
};

export type EfxbnGraphPoint = {
  x: number;
  y: number;
};

export function progressToEfxbnFrame(progress: number, frameCount: number): number | null {
  if (!Number.isFinite(progress) || !Number.isFinite(frameCount) || frameCount <= 0) return null;
  return (progress * frameCount) / 100;
}

export function frameToEfxbnProgress(frame: number, frameCount: number): number | null {
  if (!Number.isFinite(frame) || !Number.isFinite(frameCount) || frameCount <= 0) return null;
  return (frame * 100) / frameCount;
}

export function evaluateEfxbnCurve(
  keys: readonly EfxbnCurveKey[],
  progress: number,
): number {
  if (keys.length === 0) throw new Error("EFXBN curve must contain at least one key");
  if (!Number.isFinite(progress)) throw new Error(`EFXBN progress is not finite: ${progress}`);
  if (keys.length === 1) return keys[0]!.value;

  const ordered = [...keys].sort((left, right) => left.key - right.key);
  if (progress <= ordered[0]!.key) return ordered[0]!.value;
  if (progress >= ordered.at(-1)!.key) return ordered.at(-1)!.value;

  for (let index = 1; index < ordered.length; index += 1) {
    const right = ordered[index]!;
    if (progress > right.key) continue;
    const left = ordered[index - 1]!;
    const span = right.key - left.key;
    if (Math.abs(span) <= EFXBN_KEY_EPSILON) {
      throw new Error(`EFXBN curve contains duplicate progress ${right.key}`);
    }
    const amount = (progress - left.key) / span;
    return left.value + (right.value - left.value) * amount;
  }

  return ordered.at(-1)!.value;
}

export function findEfxbnKeyAtProgress(
  keys: readonly EfxbnCurveKey[],
  progress: number,
): number | null {
  const index = keys.findIndex((entry) => Math.abs(entry.key - progress) <= EFXBN_KEY_EPSILON);
  return index >= 0 ? index : null;
}

export function insertSampledEfxbnKey(
  keys: readonly EfxbnCurveKey[],
  progress: number,
): EfxbnCurveKey[] {
  if (findEfxbnKeyAtProgress(keys, progress) !== null) return keys.map((entry) => ({ ...entry }));
  const value = evaluateEfxbnCurve(keys, progress);
  return [...keys.map((entry) => ({ ...entry })), { key: progress, value }].sort(
    (left, right) => left.key - right.key,
  );
}

export function fitEfxbnValueRange(
  curves: readonly (readonly EfxbnCurveKey[])[],
): { min: number; max: number } {
  const values = curves.flatMap((keys) => keys.map((entry) => entry.value));
  if (values.length === 0) return { min: -1, max: 1 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    const padding = Math.max(1, Math.abs(min) * 0.5);
    return { min: min - padding, max: max + padding };
  }
  const padding = (max - min) * 0.08;
  return { min: min - padding, max: max + padding };
}

export function initialEfxbnGraphView(
  curves: readonly (readonly EfxbnCurveKey[])[],
): EfxbnGraphView {
  const progressValues = curves.flatMap((keys) => keys.map((entry) => entry.key));
  const values = fitEfxbnValueRange(curves);
  return {
    progressMin: Math.min(0, ...progressValues),
    progressMax: Math.max(100, ...progressValues),
    valueMin: values.min,
    valueMax: values.max,
  };
}

function requireGraphSpan(view: EfxbnGraphView, width: number, height: number) {
  const progressSpan = view.progressMax - view.progressMin;
  const valueSpan = view.valueMax - view.valueMin;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    progressSpan <= 0 ||
    valueSpan <= 0
  ) {
    throw new Error("EFXBN graph requires positive data and pixel spans");
  }
  return { progressSpan, valueSpan };
}

export function efxbnDataToPixel(
  point: EfxbnCurveKey,
  view: EfxbnGraphView,
  width: number,
  height: number,
): EfxbnGraphPoint {
  const { progressSpan, valueSpan } = requireGraphSpan(view, width, height);
  return {
    x: ((point.key - view.progressMin) / progressSpan) * width,
    y: height - ((point.value - view.valueMin) / valueSpan) * height,
  };
}

export function efxbnPixelToData(
  point: EfxbnGraphPoint,
  view: EfxbnGraphView,
  width: number,
  height: number,
): EfxbnCurveKey {
  const { progressSpan, valueSpan } = requireGraphSpan(view, width, height);
  return {
    key: view.progressMin + (point.x / width) * progressSpan,
    value: view.valueMin + ((height - point.y) / height) * valueSpan,
  };
}
