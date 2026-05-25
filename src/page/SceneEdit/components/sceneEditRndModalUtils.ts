export const SCENE_EDIT_RND_VIEWPORT_MARGIN = 48;
export const SCENE_EDIT_RND_DRAG_HANDLE = "scene-edit-rnd-modal-handle";

export interface SceneEditRndModalDimensions {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
}

export function getSceneEditViewportSize() {
  if (typeof window === "undefined") {
    return { width: 1280, height: 800 };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}

export function clampSceneEditModalPosition(
  position: { x: number; y: number },
  size: { width: number; height: number },
) {
  const { width: vw, height: vh } = getSceneEditViewportSize();
  const edge = SCENE_EDIT_RND_VIEWPORT_MARGIN / 2;
  const maxX = Math.max(edge, vw - size.width - edge);
  const maxY = Math.max(edge, vh - size.height - edge);
  return {
    x: Math.min(Math.max(edge, position.x), maxX),
    y: Math.min(Math.max(edge, position.y), maxY),
  };
}

export function getSceneEditCascadePosition(
  size: { width: number; height: number },
  cascadeIndex: number,
) {
  return clampSceneEditModalPosition(
    { x: 80 + cascadeIndex * 28, y: 60 + cascadeIndex * 28 },
    size,
  );
}

export function getDetailViewModalDimensions(): SceneEditRndModalDimensions {
  const { width: vw, height: vh } = getSceneEditViewportSize();
  const maxWidth = Math.max(320, vw - SCENE_EDIT_RND_VIEWPORT_MARGIN);
  const maxHeight = Math.max(280, vh - SCENE_EDIT_RND_VIEWPORT_MARGIN);
  const width = Math.min(maxWidth, 760, Math.max(520, Math.round(vw * 0.55)));
  const height = Math.min(maxHeight, 720, Math.max(400, Math.round(vh * 0.78)));

  return {
    width,
    height,
    minWidth: Math.min(maxWidth, 480),
    minHeight: 320,
    maxWidth,
    maxHeight,
  };
}

export function getEffectDetailViewModalDimensions(): SceneEditRndModalDimensions {
  const { width: vw, height: vh } = getSceneEditViewportSize();
  const maxWidth = Math.max(320, vw - SCENE_EDIT_RND_VIEWPORT_MARGIN);
  const maxHeight = Math.max(280, vh - SCENE_EDIT_RND_VIEWPORT_MARGIN);
  const width = Math.min(maxWidth, 720, Math.max(480, Math.round(vw * 0.5)));
  const height = Math.min(maxHeight, 680, Math.max(360, Math.round(vh * 0.72)));

  return {
    width,
    height,
    minWidth: Math.min(maxWidth, 440),
    minHeight: 280,
    maxWidth,
    maxHeight,
  };
}
