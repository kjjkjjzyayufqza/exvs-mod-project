export type SceneNodeVisibilityMap = Readonly<Record<string, boolean>>;
export type SceneNodeLockMap = Readonly<Record<string, boolean>>;

export function isSceneNodeVisible(
  nodeId: string,
  visibility: SceneNodeVisibilityMap,
): boolean {
  return visibility[nodeId] ?? true;
}

export function isSceneNodeLocked(
  nodeId: string,
  locks: SceneNodeLockMap,
): boolean {
  return locks[nodeId] ?? false;
}

export function canRenderSceneNode(
  nodeId: string,
  visibility: SceneNodeVisibilityMap,
  _locks: SceneNodeLockMap,
): boolean {
  return isSceneNodeVisible(nodeId, visibility);
}

export function canEditSceneNode(
  nodeId: string,
  visibility: SceneNodeVisibilityMap,
  locks: SceneNodeLockMap,
): boolean {
  return isSceneNodeVisible(nodeId, visibility) && !isSceneNodeLocked(nodeId, locks);
}
