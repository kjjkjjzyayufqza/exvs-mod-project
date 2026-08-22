import type {
  EfxbnControlName,
  EfxbnCurveKey,
  EfxbnCurveReplacement,
} from "./efxbnDocument";
import { EFXBN_KEY_EPSILON } from "./efxbnDocument";
import {
  frameToEfxbnProgress,
  progressToEfxbnFrame,
} from "./efxbnCurveMath";

export type EfxbnGraphKeyRef = {
  controlName: EfxbnControlName;
  sourceKey: number;
};

export type EfxbnGraphKeyPixel = {
  ref: EfxbnGraphKeyRef;
  x: number;
  y: number;
};

export type EfxbnGraphBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export function sameEfxbnGraphKeyRef(
  left: EfxbnGraphKeyRef,
  right: EfxbnGraphKeyRef,
): boolean {
  return (
    left.controlName === right.controlName &&
    Math.abs(left.sourceKey - right.sourceKey) <= EFXBN_KEY_EPSILON
  );
}

export function toggleEfxbnKeySelection(
  current: readonly EfxbnGraphKeyRef[],
  next: EfxbnGraphKeyRef,
  additive: boolean,
): EfxbnGraphKeyRef[] {
  if (!additive) return [next];
  return current.some((entry) => sameEfxbnGraphKeyRef(entry, next))
    ? current.filter((entry) => !sameEfxbnGraphKeyRef(entry, next))
    : [...current, next];
}

export function mergeEfxbnKeySelection(
  current: readonly EfxbnGraphKeyRef[],
  incoming: readonly EfxbnGraphKeyRef[],
): EfxbnGraphKeyRef[] {
  const next = [...current];
  for (const entry of incoming) {
    if (!next.some((candidate) => sameEfxbnGraphKeyRef(candidate, entry))) next.push(entry);
  }
  return next;
}

export function boxSelectEfxbnKeys(
  keys: readonly EfxbnGraphKeyPixel[],
  box: EfxbnGraphBox,
): EfxbnGraphKeyRef[] {
  const left = Math.min(box.left, box.right);
  const right = Math.max(box.left, box.right);
  const top = Math.min(box.top, box.bottom);
  const bottom = Math.max(box.top, box.bottom);
  return keys
    .filter((entry) => entry.x >= left && entry.x <= right && entry.y >= top && entry.y <= bottom)
    .map((entry) => entry.ref);
}

function snappedProgress(progress: number, frameCount: number): number {
  const frame = progressToEfxbnFrame(progress, frameCount);
  if (frame === null) return progress;
  return frameToEfxbnProgress(Math.round(frame), frameCount) ?? progress;
}

function assertDistinctProgress(controlName: EfxbnControlName, keys: readonly EfxbnCurveKey[]) {
  for (let index = 1; index < keys.length; index += 1) {
    if (Math.abs(keys[index - 1]!.key - keys[index]!.key) <= EFXBN_KEY_EPSILON) {
      throw new Error(`EFXBN curve ${controlName} has duplicate progress ${keys[index]!.key}`);
    }
  }
}

export function moveEfxbnSelectedKeys(input: {
  curves: Partial<Record<EfxbnControlName, readonly EfxbnCurveKey[]>>;
  selected: readonly EfxbnGraphKeyRef[];
  deltaProgress: number;
  deltaValue: number;
  frameCount: number;
  snapToFrame: boolean;
}): EfxbnCurveReplacement[] {
  if (!Number.isFinite(input.deltaProgress) || !Number.isFinite(input.deltaValue)) {
    throw new Error("EFXBN graph drag requires finite deltas");
  }
  const selectedByCurve = new Map<EfxbnControlName, Set<number>>();
  for (const entry of input.selected) {
    const keys = selectedByCurve.get(entry.controlName) ?? new Set<number>();
    keys.add(entry.sourceKey);
    selectedByCurve.set(entry.controlName, keys);
  }

  return [...selectedByCurve].map(([controlName, selectedKeys]) => {
    const source = input.curves[controlName];
    if (!source) throw new Error(`EFXBN graph has no visible curve ${controlName}`);
    const keys = source
      .map((entry) => {
        const selected = [...selectedKeys].some(
          (sourceKey) => Math.abs(sourceKey - entry.key) <= EFXBN_KEY_EPSILON,
        );
        if (!selected) return { ...entry };
        const moved = entry.key + input.deltaProgress;
        return {
          key: input.snapToFrame ? snappedProgress(moved, input.frameCount) : moved,
          value: entry.value + input.deltaValue,
        };
      })
      .sort((left, right) => left.key - right.key);
    assertDistinctProgress(controlName, keys);
    return { controlName, keys };
  });
}
