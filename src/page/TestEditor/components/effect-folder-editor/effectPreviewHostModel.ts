/**
 * The host model is the opaque geometry an effect is played against.
 *
 * In game every soft particle, lighting and framebuffer term is computed against the stage and
 * the unit the effect is attached to. The preview scene has no such geometry, which is why
 * 66.3% of drawable blocks set `enableSoftParticle` and none of them could ever fade. Loading a
 * user-chosen unit model alongside the effect supplies that missing scene context — and, just
 * as usefully, the only scale reference the preview has ever had.
 */

export type EffectPreviewModelLoadPlan = {
  /** Paths in the order `loadModelSetAt` receives them. */
  paths: readonly string[];
  /** Index of the host inside `paths`, or null when no host is configured. */
  hostPathIndex: number | null;
};

/**
 * Composes the model set for one preview.
 *
 * The host goes last: `EffectFolderPreviewScene` maps returned instances onto model slots by
 * position, so appending leaves every effect block's index untouched.
 */
export function planEffectPreviewModelLoad(
  effectModelPaths: readonly string[],
  hostModelPath: string | null,
): EffectPreviewModelLoadPlan {
  const host = hostModelPath?.trim() ?? "";
  if (!host) {
    return { paths: [...effectModelPaths], hostPathIndex: null };
  }
  if (!/\.numdlb$/i.test(host)) {
    throw new Error(`Host model must be a .numdlb file, received: ${host}`);
  }
  return { paths: [...effectModelPaths, host], hostPathIndex: effectModelPaths.length };
}

/** Folder plus file name — enough to tell two identically named models apart in the toolbar. */
export function effectPreviewHostModelLabel(path: string): string {
  const segments = path.split(/[\\/]/).filter((segment) => segment.length > 0);
  return segments.slice(-2).join("/");
}
