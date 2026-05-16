export type SceneEditorGizmoEventPhase = "drag" | "commit";

export function shouldSyncSceneStateForGizmoEvent(phase: SceneEditorGizmoEventPhase): boolean {
  return phase === "commit";
}

export function shouldInvalidateViewportForGizmoEvent(_phase: SceneEditorGizmoEventPhase): boolean {
  return true;
}

export function shouldRenderGizmoControls({
  isSelected,
  hasCommitHandler,
}: {
  isSelected: boolean;
  hasCommitHandler: boolean;
}): boolean {
  return isSelected && hasCommitHandler;
}
