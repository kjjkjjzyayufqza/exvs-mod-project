import { Bone, Matrix4, Quaternion, Skeleton, Vector3, type Object3D } from "three";
import type { MotionBoneLocal } from "./motionPreviewTypes";
import { mat4FromSsbhColumns } from "./skeletonLines";
import type { SkelDataJson } from "./types";

type LocalPose = {
  translation: [number, number, number];
  rotation: [number, number, number, number];
  scale: [number, number, number];
};

const _localM = new Matrix4();
const _localP = new Vector3();
const _localQ = new Quaternion();
const _localS = new Vector3();
const _poseM = new Matrix4();
const _restM = new Matrix4();
const _motionM = new Matrix4();
const _combinedM = new Matrix4();

function setLocalPose(target: Object3D, pose: LocalPose): void {
  target.position.set(pose.translation[0], pose.translation[1], pose.translation[2]);
  target.quaternion.set(pose.rotation[0], pose.rotation[1], pose.rotation[2], pose.rotation[3]);
  target.scale.set(pose.scale[0], pose.scale[1], pose.scale[2]);
  target.updateMatrix();
}

function matrixFromPose(pose: LocalPose): Matrix4 {
  return _poseM.compose(
    _localP.set(pose.translation[0], pose.translation[1], pose.translation[2]),
    _localQ.set(pose.rotation[0], pose.rotation[1], pose.rotation[2], pose.rotation[3]),
    _localS.set(pose.scale[0], pose.scale[1], pose.scale[2]),
  );
}

export function localPoseFromSsbhTransform(transform: number[][]): LocalPose {
  _localM.copy(mat4FromSsbhColumns(transform));
  _localM.decompose(_localP, _localQ, _localS);
  return {
    translation: [_localP.x, _localP.y, _localP.z],
    rotation: [_localQ.x, _localQ.y, _localQ.z, _localQ.w],
    scale: [_localS.x, _localS.y, _localS.z],
  };
}

function isValidParentIndex(parentIndex: number | null | undefined, boneCount: number): parentIndex is number {
  return parentIndex !== null && parentIndex !== undefined && parentIndex >= 0 && parentIndex < boneCount;
}

export function applyLocalPoseToObjects(
  objects: readonly (Object3D | null)[],
  locals: readonly MotionBoneLocal[] | readonly LocalPose[],
): void {
  const count = Math.min(objects.length, locals.length);
  for (let i = 0; i < count; i++) {
    const target = objects[i];
    const pose = locals[i];
    if (!target || !pose) {
      continue;
    }
    setLocalPose(target, pose);
  }
}

export function composeRestAndMotionLocal(restPose: LocalPose, motionPose: LocalPose): LocalPose {
  _restM.copy(matrixFromPose(restPose));
  _motionM.copy(matrixFromPose(motionPose));
  _combinedM.multiplyMatrices(_restM, _motionM);
  _combinedM.decompose(_localP, _localQ, _localS);
  return {
    translation: [_localP.x, _localP.y, _localP.z],
    rotation: [_localQ.x, _localQ.y, _localQ.z, _localQ.w],
    scale: [_localS.x, _localS.y, _localS.z],
  };
}

export function applyMotionLocalsWithRestBase(
  objects: readonly (Object3D | null)[],
  restLocals: readonly LocalPose[],
  motionLocals: readonly MotionBoneLocal[],
): void {
  const count = Math.min(objects.length, restLocals.length, motionLocals.length);
  for (let i = 0; i < count; i++) {
    const target = objects[i];
    const rest = restLocals[i];
    const motion = motionLocals[i];
    if (!target || !rest || !motion) {
      continue;
    }
    setLocalPose(target, composeRestAndMotionLocal(rest, motion));
  }
}

export type GpuSkeletonRuntime = {
  bones: Bone[];
  rootBones: Bone[];
  skeleton: Skeleton;
  restLocals: LocalPose[];
};

export function updateGpuSkeletonWorld(runtime: GpuSkeletonRuntime): void {
  for (const root of runtime.rootBones) {
    root.updateWorldMatrix(true, true);
  }
}

export function createGpuSkeletonRuntime(skel: SkelDataJson): GpuSkeletonRuntime {
  const bones = skel.bones.map(() => new Bone());
  const rootBones: Bone[] = [];
  const restLocals = skel.bones.map((bone) => localPoseFromSsbhTransform(bone.transform as number[][]));
  const boneCount = bones.length;

  for (let i = 0; i < bones.length; i++) {
    setLocalPose(bones[i]!, restLocals[i]!);
  }
  for (let i = 0; i < skel.bones.length; i++) {
    const parent = skel.bones[i]!.parent_index;
    if (!isValidParentIndex(parent, boneCount)) {
      rootBones.push(bones[i]!);
      continue;
    }
    bones[parent]?.add(bones[i]!);
  }
  for (const root of rootBones) {
    root.updateWorldMatrix(true, true);
  }

  const skeleton = new Skeleton(bones);
  skeleton.calculateInverses();
  skeleton.update();

  return { bones, rootBones, skeleton, restLocals };
}

