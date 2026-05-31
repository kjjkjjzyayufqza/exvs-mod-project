import { Group } from "three";
import { describe, expect, it } from "vitest";
import {
  BONE_POSE_FLOATS_PER_BONE,
  bonePosesEqual,
  decodeBonePoseInto,
  encodeBonePose,
} from "./bonePoseHistory";

function makeBone(
  px: number,
  py: number,
  pz: number,
  qx: number,
  qy: number,
  qz: number,
  qw: number,
  sx: number,
  sy: number,
  sz: number,
): Group {
  const g = new Group();
  g.position.set(px, py, pz);
  g.quaternion.set(qx, qy, qz, qw);
  g.scale.set(sx, sy, sz);
  g.updateMatrix();
  return g;
}

describe("bonePoseHistory", () => {
  it("encode and decode round-trip per bone", () => {
    const refs: (Group | null)[] = [
      makeBone(1, 2, 3, 0, 0, 0, 1, 1, 1, 1),
      null,
      makeBone(0, 0, 0, 0, 1, 0, 0, 2, 2, 2),
    ];
    const n = 3;
    const data = encodeBonePose(refs, n);
    expect(data.length).toBe(n * BONE_POSE_FLOATS_PER_BONE);

    const refs2: (Group | null)[] = [new Group(), null, new Group()];
    decodeBonePoseInto(data, refs2, n);

    expect(refs2[0]!.position.toArray()).toEqual([1, 2, 3]);
    expect(refs2[0]!.quaternion.toArray()).toEqual([0, 0, 0, 1]);
    expect(refs2[0]!.scale.toArray()).toEqual([1, 1, 1]);

    expect(refs2[2]!.quaternion.toArray()).toEqual([0, 1, 0, 0]);
    expect(refs2[2]!.scale.toArray()).toEqual([2, 2, 2]);
  });

  it("bonePosesEqual detects small differences", () => {
    const a = new Float32Array([1, 0, 0, 0, 0, 0, 1, 1, 1, 1]);
    const b = new Float32Array([1, 0, 0, 0, 0, 0, 1, 1, 1, 1]);
    expect(bonePosesEqual(a, b)).toBe(true);
    const c = new Float32Array(a);
    c[0] = 1.1;
    expect(bonePosesEqual(a, c)).toBe(false);
  });

  it("decodeBonePoseInto throws on length mismatch", () => {
    const refs: (Group | null)[] = [new Group()];
    expect(() => decodeBonePoseInto(new Float32Array(5), refs, 1)).toThrow(/snapshot length/);
  });
});
