import { invoke } from "@tauri-apps/api/core";

export type MotionFbxStackSummary = {
  name: string;
  frameCount: number;
  durationSeconds: number;
};

export type MotionFbxInspectReport = {
  stacks: MotionFbxStackSummary[];
  boneCount: number;
  boneNames: string[];
};

export type RigBindingPolicyValue = "exactHierarchy" | "nameOnly";

export type MotionFbxImportRequest = {
  fbxPath: string;
  nusktbPath: string;
  outputNuanmbPath: string;
  templateNuanmbPath: string | null;
  animationStackName: string | null;
  rigBindingPolicy: RigBindingPolicyValue;
};

export type MotionConversionReport = {
  outputPath: string;
  actionName: string;
  frameCount: number;
  durationSeconds: number;
  matchedBones: string[];
  ignoredBones: string[];
  preservedNonTransformGroupCount: number;
  warnings: string[];
};

export function inspectMotionFbx(fbxPath: string): Promise<MotionFbxInspectReport> {
  return invoke<MotionFbxInspectReport>("ssbh_inspect_motion_fbx", { fbxPath });
}

export function importMotionFbx(
  request: MotionFbxImportRequest,
): Promise<MotionConversionReport> {
  return invoke<MotionConversionReport>("ssbh_import_motion_fbx", { request });
}
