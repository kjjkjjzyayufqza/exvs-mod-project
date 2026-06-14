import { useEffect, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  computeDragDistancePx,
  normalizeScreenRect,
  raycastHitsSelectable,
  selectNodeIdsInScreenRect,
  type ScreenRect,
  type ViewportMultiSelectHandler,
  type ViewportSelectHandler,
  UE_VIEWPORT_DRAG_THRESHOLD_PX,
} from "./viewportInteraction";
import type { SelectableNodeRegistry } from "./viewportPick";

export type { SelectableNodeRegistry };

interface ViewportSelectionControllerProps {
  enabled: boolean;
  selectableNodesRef: React.RefObject<SelectableNodeRegistry>;
  orbitActiveRef: React.RefObject<boolean>;
  gizmoDraggingRef: React.RefObject<boolean>;
  onSelectNode: ViewportSelectHandler;
  onSelectNodes: ViewportMultiSelectHandler;
  onMarqueeRectChange: (rect: ScreenRect | null) => void;
  clickGestureRef: React.RefObject<{ x: number; y: number } | null>;
  marqueeActiveRef: React.RefObject<boolean>;
}

export function ViewportSelectionController({
  enabled,
  selectableNodesRef,
  orbitActiveRef,
  gizmoDraggingRef,
  onSelectNode,
  onSelectNodes,
  onMarqueeRectChange,
  clickGestureRef,
  marqueeActiveRef,
}: ViewportSelectionControllerProps) {
  const { camera, gl } = useThree();
  const pointerNdcRef = useRef(new THREE.Vector2());
  const gestureRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    marquee: boolean;
    ctrl: boolean;
    shift: boolean;
  } | null>(null);

  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    setCanvasElement(gl.domElement);
  }, [gl.domElement]);

  useEffect(() => {
    if (!enabled || !canvasElement) return;

    const resetGesture = () => {
      gestureRef.current = null;
      marqueeActiveRef.current = false;
      onMarqueeRectChange(null);
    };

    const clientToCanvasRect = (clientX: number, clientY: number) => {
      const bounds = canvasElement.getBoundingClientRect();
      return {
        x: clientX - bounds.left,
        y: clientY - bounds.top,
        bounds,
      };
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (event.altKey) return;
      if (gizmoDraggingRef.current || orbitActiveRef.current) return;

      clickGestureRef.current = { x: event.clientX, y: event.clientY };

      const { x, y, bounds } = clientToCanvasRect(event.clientX, event.clientY);
      pointerNdcRef.current.set(
        (x / bounds.width) * 2 - 1,
        -(y / bounds.height) * 2 + 1,
      );

      const registry = selectableNodesRef.current;
      const pickTargets = registry ? Array.from(registry.values()) : [];
      if (raycastHitsSelectable(camera, pointerNdcRef.current, pickTargets)) {
        return;
      }

      gestureRef.current = {
        active: true,
        startX: x,
        startY: y,
        marquee: false,
        ctrl: event.ctrlKey || event.metaKey,
        shift: event.shiftKey,
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture?.active) return;

      const { x, y } = clientToCanvasRect(event.clientX, event.clientY);
      const dragDistance = computeDragDistancePx(gesture.startX, gesture.startY, x, y);

      if (!gesture.marquee && dragDistance > UE_VIEWPORT_DRAG_THRESHOLD_PX) {
        gesture.marquee = true;
        marqueeActiveRef.current = true;
      }

      if (gesture.marquee) {
        onMarqueeRectChange(
          normalizeScreenRect(gesture.startX, gesture.startY, x, y),
        );
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture?.active || event.button !== 0) return;

      const { x, y, bounds } = clientToCanvasRect(event.clientX, event.clientY);
      const dragDistance = computeDragDistancePx(gesture.startX, gesture.startY, x, y);

      if (gesture.marquee || dragDistance > UE_VIEWPORT_DRAG_THRESHOLD_PX) {
        const registry = selectableNodesRef.current;
        if (registry && registry.size > 0) {
          const entries = Array.from(registry.entries()).map(([nodeId, object]) => ({
            nodeId,
            object,
          }));
          const rect = normalizeScreenRect(gesture.startX, gesture.startY, x, y);
          const ids = selectNodeIdsInScreenRect(
            entries,
            camera,
            bounds.width,
            bounds.height,
            rect,
          );
          onSelectNodes(ids, { ctrl: gesture.ctrl, shift: gesture.shift });
        } else {
          onSelectNodes([], { ctrl: gesture.ctrl, shift: gesture.shift });
        }
      } else {
        onSelectNode(null, { ctrl: gesture.ctrl, shift: gesture.shift });
      }

      resetGesture();
    };

    canvasElement.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", resetGesture);

    return () => {
      canvasElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", resetGesture);
      onMarqueeRectChange(null);
    };
  }, [
    camera,
    canvasElement,
    enabled,
    gizmoDraggingRef,
    onMarqueeRectChange,
    onSelectNode,
    onSelectNodes,
    orbitActiveRef,
    selectableNodesRef,
    clickGestureRef,
    marqueeActiveRef,
  ]);

  return null;
}
