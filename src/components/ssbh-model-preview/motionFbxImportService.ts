/**
 * FBX → NUANMB import client.
 *
 * Backend write path:
 * - Omits `ATH_*` helper bones by default (`omitAthHelperBones: true`).
 *   Uncheck for extra/Part clips. Policy: `docs/nuanmb-ath-helper-bone-policy.md`.
 * - Uncompressed Anim v1.2 only (no residual 0x3409/0x4409).
 * - Emits stock `CompensateScale` + `Visibility` on every Transform track so
 *   in-game playback matches EXVS2 body clips (editor-only dense TRS is not enough).
 * - Snaps near-constant hold channels to 0x4003 / 0x3003 constants.
 */
import { invoke } from "@tauri-apps/api/core";
import { join, tempDir } from "@tauri-apps/api/path";
import { mkdir } from "@tauri-apps/plugin-fs";

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
  omitAthHelperBones: boolean;
};

/** Preview-only: convert FBX→temp NUANMB without asking the user for a save path. */
export type MotionFbxPreviewRequest = {
  fbxPath: string;
  nusktbPath: string;
  templateNuanmbPath: string | null;
  animationStackName: string | null;
  rigBindingPolicy: RigBindingPolicyValue;
  omitAthHelperBones?: boolean;
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

const MOTION_FBX_PREVIEW_CACHE_DIR = "exvs2-motion-fbx-preview";

function fileStemFromPath(path: string): string {
  const base = path.replace(/[/\\]+$/, "");
  const slash = Math.max(base.lastIndexOf("/"), base.lastIndexOf("\\"));
  const file = slash >= 0 ? base.slice(slash + 1) : base;
  const dot = file.lastIndexOf(".");
  const stem = (dot > 0 ? file.slice(0, dot) : file).trim();
  // Keep filename-safe for temp paths across platforms.
  const cleaned = stem.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "_").slice(0, 80);
  return cleaned || "motion";
}

export function inspectMotionFbx(fbxPath: string): Promise<MotionFbxInspectReport> {
  return invoke<MotionFbxInspectReport>("ssbh_inspect_motion_fbx", { fbxPath });
}

export function importMotionFbx(
  request: MotionFbxImportRequest,
): Promise<MotionConversionReport> {
  return invoke<MotionConversionReport>("ssbh_import_motion_fbx", { request });
}

/**
 * Convert a pure animation FBX onto the active skeleton into a cache NUANMB,
 * then return the same report shape as import. Callers load `outputPath` into the
 * preview without a save dialog.
 */
export async function previewMotionFbx(
  request: MotionFbxPreviewRequest,
): Promise<MotionConversionReport> {
  const fbxPath = request.fbxPath.trim();
  const nusktbPath = request.nusktbPath.trim();
  if (!fbxPath) {
    throw new Error("fbxPath must not be empty");
  }
  if (!nusktbPath) {
    throw new Error("nusktbPath must not be empty");
  }

  const baseTemp = await tempDir();
  const cacheDir = await join(baseTemp, MOTION_FBX_PREVIEW_CACHE_DIR);
  await mkdir(cacheDir, { recursive: true });
  const stamp = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const outputNuanmbPath = await join(
    cacheDir,
    `${fileStemFromPath(fbxPath)}_${stamp}.nuanmb`,
  );

  return importMotionFbx({
    fbxPath,
    nusktbPath,
    outputNuanmbPath,
    templateNuanmbPath: request.templateNuanmbPath,
    animationStackName: request.animationStackName,
    rigBindingPolicy: request.rigBindingPolicy,
    omitAthHelperBones: request.omitAthHelperBones ?? true,
  });
}

export type ClipOperationPayload =
  | { kind: "trim"; startFrame: number; endFrame: number }
  | { kind: "retime"; speedFactor: number };

export type NuanmbClipTransformRequest = {
  nuanmbPath: string;
  nusktbPath: string;
  outputNuanmbPath: string;
  operation: ClipOperationPayload;
};

export function transformNuanmbClip(
  request: NuanmbClipTransformRequest,
): Promise<MotionConversionReport> {
  return invoke<MotionConversionReport>("ssbh_transform_nuanmb_clip", { request });
}
