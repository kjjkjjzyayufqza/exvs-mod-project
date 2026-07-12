import { invoke } from "@tauri-apps/api/core";

export type RigBindingPolicy = "exactHierarchy" | "nameOnly";

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

export type NuanmbToCascadeurBridgeRequest = {
  nuanmbPath: string;
  nusktbPath: string;
  outputDirectory: string;
  actionName: string | null;
};

export type CascadeurBridgeToNuanmbRequest = {
  fbxPath: string;
  bridgeManifestPath: string;
  nusktbPath: string;
  outputNuanmbPath: string;
  animationStackName: string | null;
  templateNuanmbPath: string | null;
  rigBindingPolicy: RigBindingPolicy;
};

export function exportNuanmbToCascadeurBridge(
  request: NuanmbToCascadeurBridgeRequest,
): Promise<MotionConversionReport> {
  return invoke<MotionConversionReport>("ssbh_export_nuanmb_to_cascadeur_bridge", { request });
}

export function importCascadeurBridgeToNuanmb(
  request: CascadeurBridgeToNuanmbRequest,
): Promise<MotionConversionReport> {
  return invoke<MotionConversionReport>("ssbh_import_cascadeur_bridge_to_nuanmb", { request });
}
