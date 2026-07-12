import { BufferAttribute, BufferGeometry, Matrix4, Quaternion, Vector3 } from "three";
import type { BoneJson, SkelDataJson, SsbhMat4Json } from "./types";

export function mat4FromSsbhColumns(transform: SsbhMat4Json): Matrix4 {
  const m = new Matrix4();
  if (transform.length === 16 && transform.every((value) => typeof value === "number")) {
    return m.fromArray(transform as number[]);
  }
  const columns = transform as number[][];
  const flat = [
    columns[0]?.[0] ?? 0,
    columns[0]?.[1] ?? 0,
    columns[0]?.[2] ?? 0,
    columns[0]?.[3] ?? 0,
    columns[1]?.[0] ?? 0,
    columns[1]?.[1] ?? 0,
    columns[1]?.[2] ?? 0,
    columns[1]?.[3] ?? 0,
    columns[2]?.[0] ?? 0,
    columns[2]?.[1] ?? 0,
    columns[2]?.[2] ?? 0,
    columns[2]?.[3] ?? 0,
    columns[3]?.[0] ?? 0,
    columns[3]?.[1] ?? 0,
    columns[3]?.[2] ?? 0,
    columns[3]?.[3] ?? 0,
  ];
  m.fromArray(flat);
  return m;
}

export function boneWorldMatrices(bones: BoneJson[]): Matrix4[] {
  const world: (Matrix4 | undefined)[] = new Array(bones.length);
  const stack = new Set<number>();

  function worldAt(i: number): Matrix4 {
    const cached = world[i];
    if (cached) return cached;
    if (stack.has(i)) {
      throw new Error(`Skeleton hierarchy cycle detected at bone index ${i}`);
    }
    stack.add(i);
    const local = mat4FromSsbhColumns(bones[i]!.transform);
    const p = bones[i]!.parent_index;
    let result: Matrix4;
    if (p === null || p === undefined) {
      result = local;
    } else {
      if (p < 0 || p >= bones.length) {
        throw new Error(`Bone ${i} has invalid parent_index ${p}`);
      }
      result = worldAt(p).clone().multiply(local);
    }
    world[i] = result;
    stack.delete(i);
    return result;
  }

  for (let i = 0; i < bones.length; i++) {
    worldAt(i);
  }
  return world as Matrix4[];
}

export function buildSkeletonLineGeometry(skel: SkelDataJson): BufferGeometry {
  const bones = skel.bones;
  if (!bones.length) {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(0), 3));
    return g;
  }
  const world = boneWorldMatrices(bones);
  const pos = new Vector3();
  const quat = new Quaternion();
  const scale = new Vector3();
  const positions: number[] = [];
  for (let i = 0; i < bones.length; i++) {
    const parent = bones[i]!.parent_index;
    if (parent === null || parent === undefined) continue;
    world[parent]!.decompose(pos, quat, scale);
    const ax = pos.x;
    const ay = pos.y;
    const az = pos.z;
    world[i]!.decompose(pos, quat, scale);
    const bx = pos.x;
    const by = pos.y;
    const bz = pos.z;
    positions.push(ax, ay, az, bx, by, bz);
  }
  const geom = new BufferGeometry();
  geom.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  return geom;
}
