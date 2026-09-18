import type {
  EfxbnControlName,
  EfxbnCurveKey,
  EfxbnCurveReplacement,
} from "./efxbnDocument";
import { EFXBN_KEY_EPSILON } from "./efxbnDocument";
import {
  findEfxbnKeyAtProgress,
  frameToEfxbnProgress,
  pickNearestEfxbnKey,
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

export function refsForEfxbnControl(
  controlName: EfxbnControlName,
  keys: readonly EfxbnCurveKey[],
): EfxbnGraphKeyRef[] {
  return keys.map((entry) => ({ controlName, sourceKey: entry.key }));
}

export function selectEfxbnChannelKeys(input: {
  controlName: EfxbnControlName;
  keys: readonly EfxbnCurveKey[];
  progress: number;
  mode: "nearest" | "all";
  current: readonly EfxbnGraphKeyRef[];
  additive: boolean;
}): EfxbnGraphKeyRef[] {
  const channelRefs =
    input.mode === "all"
      ? refsForEfxbnControl(input.controlName, input.keys)
      : (() => {
          const nearest = pickNearestEfxbnKey(input.keys, input.progress);
          return nearest ? [{ controlName: input.controlName, sourceKey: nearest.key }] : [];
        })();
  if (!input.additive) return channelRefs;
  return mergeEfxbnKeySelection(input.current, channelRefs);
}

export function sanitizeEfxbnGraphSelection(
  selection: readonly EfxbnGraphKeyRef[],
  curves: Partial<Record<EfxbnControlName, readonly EfxbnCurveKey[]>>,
): EfxbnGraphKeyRef[] {
  return selection.filter((entry) =>
    (curves[entry.controlName] ?? []).some(
      (key) => Math.abs(key.key - entry.sourceKey) <= EFXBN_KEY_EPSILON,
    ),
  );
}

export function inspectorChannelName(
  selection: readonly EfxbnGraphKeyRef[],
  focusedControlName: EfxbnControlName,
): EfxbnControlName | "mixed" {
  const names = [...new Set(selection.map((entry) => entry.controlName))];
  if (names.length > 1) return "mixed";
  return names[0] ?? focusedControlName;
}

export function isEfxbnEditableHotkeyTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function offsetEfxbnCopiedKeys(
  keys: readonly EfxbnCurveKey[],
  originProgress: number,
  targetProgress: number,
): EfxbnCurveKey[] {
  const delta = targetProgress - originProgress;
  return keys.map((entry) => ({ key: entry.key + delta, value: entry.value }));
}

export function mergeEfxbnPastedKeys(
  existing: readonly EfxbnCurveKey[],
  pasted: readonly EfxbnCurveKey[],
): EfxbnCurveKey[] {
  const next = existing.map((entry) => ({ ...entry }));
  for (const paste of pasted) {
    const index = findEfxbnKeyAtProgress(next, paste.key);
    if (index !== null) next[index] = { key: paste.key, value: paste.value };
    else next.push({ key: paste.key, value: paste.value });
  }
  return next.sort((left, right) => left.key - right.key);
}

export function deleteEfxbnSelectedKeys(input: {
  curves: Partial<Record<EfxbnControlName, readonly EfxbnCurveKey[]>>;
  selected: readonly EfxbnGraphKeyRef[];
}): { replacements: EfxbnCurveReplacement[]; keptLastKey: boolean } {
  let keptLastKey = false;
  const replacements: EfxbnCurveReplacement[] = [];
  for (const name of new Set(input.selected.map((entry) => entry.controlName))) {
    const source = input.curves[name];
    if (!source) throw new Error(`EFXBN graph has no curve ${name}`);
    const selectedKeys = input.selected.filter((entry) => entry.controlName === name);
    const remaining = source.filter(
      (key) => !selectedKeys.some((entry) => Math.abs(entry.sourceKey - key.key) <= EFXBN_KEY_EPSILON),
    );
    if (remaining.length === source.length) continue;
    if (remaining.length === 0) {
      keptLastKey = true;
      continue;
    }
    replacements.push({ controlName: name, keys: remaining });
  }
  return { replacements, keptLastKey };
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
