import { useEffect, type RefObject } from "react";
import * as THREE from "three";
import {
  performViewportObjectPick,
  type ViewportSelectHandler,
} from "./viewportInteraction";

export type SelectableNodeRegistry = Map<string, THREE.Object3D>;

export type ViewportPickRefs = {
  clickGestureRef?: RefObject<{ x: number; y: number } | null>;
  marqueeActiveRef?: RefObject<boolean>;
  gizmoDraggingRef?: RefObject<boolean>;
  orbitActiveRef?: RefObject<boolean>;
};

export function useRegisterSelectableNode(
  nodeId: string,
  object: THREE.Object3D | null,
  registryRef?: RefObject<SelectableNodeRegistry>,
) {
  useEffect(() => {
    if (!object || !registryRef) return;
    registryRef.current.set(nodeId, object);
    return () => {
      registryRef.current.delete(nodeId);
    };
  }, [nodeId, object, registryRef]);
}

export function runViewportObjectPick(
  nativeEvent: MouseEvent,
  nodeId: string,
  onSelect: ViewportSelectHandler,
  options: {
    clickPickSelectionEnabled: boolean;
    isLocked?: boolean;
    refs: ViewportPickRefs;
  },
) {
  performViewportObjectPick(nativeEvent, nodeId, onSelect, {
    clickPickSelectionEnabled: options.clickPickSelectionEnabled,
    clickGesture: options.refs.clickGestureRef?.current ?? null,
    gizmoDragging: options.refs.gizmoDraggingRef?.current,
    orbitActive: options.refs.orbitActiveRef?.current,
    marqueeActive: options.refs.marqueeActiveRef?.current,
    isLocked: options.isLocked,
  });
}
