import { Group, Matrix4, Quaternion, Vector3 } from "three";
import { mat4FromSsbhColumns } from "./skeletonLines";
import type { BoneJson } from "./types";

const _restLocalM = new Matrix4();
const _restPos = new Vector3();
const _restQuat = new Quaternion();
const _restScl = new Vector3();

export function applyRestLocalMatrices(refs: (Group | null)[], bones: BoneJson[]): void {
  for (let i = 0; i < bones.length; i++) {
    const g = refs[i];
    if (!g) continue;
    _restLocalM.copy(mat4FromSsbhColumns(bones[i]!.transform));
    _restLocalM.decompose(_restPos, _restQuat, _restScl);
    g.position.copy(_restPos);
    g.quaternion.copy(_restQuat);
    g.scale.copy(_restScl);
    g.matrixAutoUpdate = true;
    g.updateMatrix();
  }
}
