import type { BuiltMeshDraw } from "./types";
import type { MotionVisibilityRow } from "./motionPreviewTypes";

/**
 * Applies NUANMB visibility rules (prefix match, last match wins) like ssbh_wgpu.
 * Empty or null rules means no visibility override from motion.
 */
export function motionVisibilityAllowsMesh(
  meshObjectName: string,
  rows: readonly MotionVisibilityRow[] | null,
): boolean {
  if (!rows || rows.length === 0) return true;
  let v = true;
  for (const r of rows) {
    if (meshObjectName.startsWith(r.meshNamePrefix)) {
      v = r.visible;
    }
  }
  return v;
}

export function filterDrawsForMotionSkinning(
  draws: readonly BuiltMeshDraw[],
  visibleKeys: ReadonlySet<string>,
  rows: readonly MotionVisibilityRow[] | null,
): BuiltMeshDraw[] {
  return draws.filter(
    (draw) => visibleKeys.has(draw.key) && motionVisibilityAllowsMesh(draw.meshObjectName, rows),
  );
}

type ResolveDrawVisibilityArgs = {
  drawKey: string;
  meshObjectName: string;
  visibleKeys: ReadonlySet<string>;
  motionVisibilityRows: readonly MotionVisibilityRow[] | null;
  forceVisibleDuringMotion: boolean;
  motionPlaybackActive: boolean;
};

export function resolveDrawVisibility(args: ResolveDrawVisibilityArgs): boolean {
  const {
    drawKey,
    meshObjectName,
    visibleKeys,
    motionVisibilityRows,
    forceVisibleDuringMotion,
    motionPlaybackActive,
  } = args;
  if (forceVisibleDuringMotion && motionPlaybackActive) {
    return true;
  }
  const visViewport = visibleKeys.has(drawKey);
  if (!visViewport) {
    return false;
  }
  return motionVisibilityAllowsMesh(meshObjectName, motionVisibilityRows);
}
