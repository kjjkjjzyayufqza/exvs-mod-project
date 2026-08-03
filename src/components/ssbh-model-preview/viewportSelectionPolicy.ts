/**
 * Viewport pick → active-instance policy for SSBH model preview.
 *
 * Empty / background picks must not clear the active model: motion transport,
 * Target model, and per-instance motion state all key off activePreviewInstanceId.
 */

export type ViewportActiveInstanceResolution = {
  /** Next active instance id to apply (null means leave active unchanged). */
  nextActiveId: string | null;
  /** Whether to clear the bone pick. */
  clearBoneSelection: boolean;
};

/**
 * Resolve what an empty or multi pick should do to the active model.
 * - Non-empty pick: switch active to the picked id (last id for multi).
 * - Empty pick: keep current active; only clear bone selection.
 */
export function resolveViewportActiveInstancePick(
  pickedIds: readonly string[],
  currentActiveId: string | null,
): ViewportActiveInstanceResolution {
  if (pickedIds.length === 0) {
    return {
      nextActiveId: currentActiveId,
      clearBoneSelection: true,
    };
  }
  const last = pickedIds[pickedIds.length - 1] ?? null;
  return {
    nextActiveId: last,
    clearBoneSelection: false,
  };
}

/**
 * Whether selecting a motion target should force "Active only" isolation.
 * True when more than one model is loaded.
 */
export function shouldIsolateMotionTarget(instanceCount: number): boolean {
  return instanceCount > 1;
}

export type AttachmentVisibilityEdge = {
  parentInstanceId: string;
  childInstanceId: string;
};

/**
 * Single-view mode must still show models linked by attachment edges to the
 * active instance (e.g. beam rifle glued to body). Otherwise choosing
 * "Target model" = body hides the attached weapon.
 */
export function expandSingleViewWithAttachments(
  activeInstanceId: string | null,
  attachmentEdges: readonly AttachmentVisibilityEdge[],
): Set<string> {
  const keep = new Set<string>();
  if (!activeInstanceId) return keep;
  keep.add(activeInstanceId);
  for (const edge of attachmentEdges) {
    if (edge.parentInstanceId === activeInstanceId) {
      keep.add(edge.childInstanceId);
    }
    if (edge.childInstanceId === activeInstanceId) {
      keep.add(edge.parentInstanceId);
    }
  }
  return keep;
}

export type PreviewSelectionOutlineInput = {
  isActive: boolean;
  /**
   * Explicit UI intent. Only Inspect collection list clicks enable this.
   * Motion target / open-folder / empty 3D pick leave it false so preview stays clean.
   */
  selectionOutlineEnabled: boolean;
};

/**
 * Yellow mesh selection tint is opt-in from the Inspect model list only.
 * Motion solo / playback must never force a permanent yellow glow.
 */
export function shouldShowPreviewSelectionOutline(input: PreviewSelectionOutlineInput): boolean {
  return input.isActive && input.selectionOutlineEnabled;
}
