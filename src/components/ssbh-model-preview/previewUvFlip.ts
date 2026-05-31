import type { BufferAttribute, BufferGeometry } from "three";

const UV_BASE_KEY = "__ssbhPreviewUvBase";
const UV2_BASE_KEY = "__ssbhPreviewUv2Base";

function applyUvChannel(
  geometry: BufferGeometry,
  attr: BufferAttribute | undefined,
  baseKey: string,
  flipU: boolean,
  flipV: boolean,
): void {
  if (!attr?.array) return;
  const arr = attr.array as Float32Array;
  const n = arr.length / 2;
  let base = geometry.userData[baseKey] as Float32Array | undefined;
  if (!base || base.length !== arr.length) {
    base = new Float32Array(arr);
    geometry.userData[baseKey] = base;
  }
  for (let i = 0; i < n; i++) {
    let u = base[i * 2];
    let v = base[i * 2 + 1];
    if (flipU) u = 1 - u;
    if (flipV) v = 1 - v;
    arr[i * 2] = u;
    arr[i * 2 + 1] = v;
  }
  attr.needsUpdate = true;
}

/**
 * Preview-only UV mirror: transforms mesh `uv` / `uv2` from a frozen copy of the first-seen values.
 * Safe to call repeatedly when flip flags change.
 */
export function applyPreviewUvFlip(geometry: BufferGeometry, flipU: boolean, flipV: boolean): void {
  applyUvChannel(geometry, geometry.getAttribute("uv") as BufferAttribute | undefined, UV_BASE_KEY, flipU, flipV);
  applyUvChannel(geometry, geometry.getAttribute("uv2") as BufferAttribute | undefined, UV2_BASE_KEY, flipU, flipV);
}
