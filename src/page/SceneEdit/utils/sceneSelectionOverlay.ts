export const SCENE_SELECTION_WIREFRAME_COLOR = "#f59e0b";

export interface SelectionWireframeOverlayProps {
  visible: boolean;
  color: string;
  depthTest: boolean;
  transparent: boolean;
  opacity: number;
  wireframe: boolean;
}

export function getSelectionWireframeOverlayProps(
  isSelected: boolean,
): SelectionWireframeOverlayProps {
  return {
    visible: isSelected,
    color: SCENE_SELECTION_WIREFRAME_COLOR,
    depthTest: false,
    transparent: true,
    opacity: 0.45,
    wireframe: true,
  };
}
