import type { Group } from "three";

/** Per bone: position (3) + quaternion (4) + scale (3). */
export const BONE_POSE_FLOATS_PER_BONE = 10;

export function encodeBonePose(refs: (Group | null)[], boneCount: number): Float32Array {
  const out = new Float32Array(boneCount * BONE_POSE_FLOATS_PER_BONE);
  let o = 0;
  for (let i = 0; i < boneCount; i++) {
    const g = refs[i];
    if (!g) {
      o += BONE_POSE_FLOATS_PER_BONE;
      continue;
    }
    out[o++] = g.position.x;
    out[o++] = g.position.y;
    out[o++] = g.position.z;
    out[o++] = g.quaternion.x;
    out[o++] = g.quaternion.y;
    out[o++] = g.quaternion.z;
    out[o++] = g.quaternion.w;
    out[o++] = g.scale.x;
    out[o++] = g.scale.y;
    out[o++] = g.scale.z;
  }
  return out;
}

export function decodeBonePoseInto(data: Float32Array, refs: (Group | null)[], boneCount: number): void {
  const expected = boneCount * BONE_POSE_FLOATS_PER_BONE;
  if (data.length !== expected) {
    throw new Error(`Bone pose snapshot length ${data.length} does not match ${expected} for ${boneCount} bones.`);
  }
  let o = 0;
  for (let i = 0; i < boneCount; i++) {
    const g = refs[i];
    if (!g) {
      o += BONE_POSE_FLOATS_PER_BONE;
      continue;
    }
    g.position.set(data[o++]!, data[o++]!, data[o++]!);
    g.quaternion.set(data[o++]!, data[o++]!, data[o++]!, data[o++]!);
    g.scale.set(data[o++]!, data[o++]!, data[o++]!);
    g.updateMatrix();
  }
}

export function bonePosesEqual(a: Float32Array, b: Float32Array, eps = 1e-5): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i]! - b[i]!) > eps) return false;
  }
  return true;
}
