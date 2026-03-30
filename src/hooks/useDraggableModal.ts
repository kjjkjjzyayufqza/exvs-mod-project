import { useCallback, useRef, useEffect, useLayoutEffect, type RefObject, type PointerEvent as ReactPointerEvent } from "react";

type Position = { x: number; y: number };

type UseDraggableModalOptions = {
  /** Initial position; defaults to { x: 0, y: 0 }. */
  defaultPosition?: Position;
  /** When true, clamp the element inside the viewport. Defaults to true. */
  boundToViewport?: boolean;
};

type UseDraggableModalReturn = {
  /** Attach to the draggable root element. */
  nodeRef: RefObject<HTMLDivElement | null>;
  /** Spread onto the drag-handle element: `<div {...handleProps}>`. */
  handleProps: {
    onPointerDown: (e: ReactPointerEvent) => void;
    style: { cursor: string; userSelect: string; touchAction: string };
  };
};

/**
 * Lightweight drag hook that replaces react-draggable.
 * Uses pointer events so the delta is always in CSS-pixel space.
 * Modifies the DOM directly instead of using React state for dragging, 
 * which avoids re-renders and drastically improves performance.
 */
export function useDraggableModal(options: UseDraggableModalOptions = {}): UseDraggableModalReturn {
  const { defaultPosition = { x: 0, y: 0 }, boundToViewport = true } = options;
  const nodeRef = useRef<HTMLDivElement | null>(null);
  
  const positionRef = useRef<Position>(defaultPosition);
  const dragging = useRef(false);
  const animationFrameRef = useRef<number | null>(null);

  const applyTransform = useCallback((x: number, y: number) => {
    if (nodeRef.current) {
      nodeRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
  }, []);

  // Sync initial position and re-apply on renders so other updates don't wipe it
  useLayoutEffect(() => {
    // Only re-apply if we are not currently dragging
    // to avoid fighting with the requestAnimationFrame loop.
    // Also request a frame to ensure React hasn't already committed a reset style.
    if (!dragging.current) {
      applyTransform(positionRef.current.x, positionRef.current.y);
    }
  });

      const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      
      const target = e.target as HTMLElement;
      target.setPointerCapture(e.pointerId);

      dragging.current = true;
      // Record initial pointer position
      const initialPointer = { x: e.clientX, y: e.clientY };
      // Record initial modal position when dragging starts
      // This is crucial: we must get the ACTUAL CURRENT value of the ref right now,
      // not rely on an outdated closure scope.
      const initialPosition = { x: positionRef.current.x, y: positionRef.current.y };

      // Calculate limits once on drag start to avoid layout thrashing and desyncs
      let minX = -Infinity;
      let minY = -Infinity;
      let maxX = Infinity;
      let maxY = Infinity;

      if (boundToViewport && nodeRef.current) {
        const rect = nodeRef.current.getBoundingClientRect();
        const vw = document.documentElement.clientWidth || window.innerWidth;
        const vh = document.documentElement.clientHeight || window.innerHeight;

        // The logic for clamping is:
        // positionRef.current has the currently applied transform (translate) value.
        // We want to figure out the actual MIN and MAX translate values we can apply
        // without the element's bounding rect leaving the screen.
        
        // Example: If rect.left is 100, and our current X transform is 20,
        // then the element's base un-transformed left is 80.
        // We can move left until left becomes 0, which means transform X becomes -80.
        // So minX = currentX - rect.left
        minX = initialPosition.x - rect.left;
        minY = initialPosition.y - rect.top;
        
        // To move right, we can move until rect.right reaches vw.
        // The space we have on the right is (vw - rect.right).
        // So maxX = currentX + (vw - rect.right)
        maxX = initialPosition.x + (vw - rect.right);
        maxY = initialPosition.y + (vh - rect.bottom);

        // However, if the modal itself is larger than the screen, max will be less than min.
        // We ensure min is always less than max by clamping max to min if necessary,
        // preferring to stick to the top-left edge if it doesn't fit.
        maxX = Math.max(minX, maxX);
        maxY = Math.max(minY, maxY);
      }

      const onPointerMove = (ev: globalThis.PointerEvent) => {
        if (!dragging.current) return;
        
        // Calculate delta from initial pointer position
        const dx = ev.clientX - initialPointer.x;
        const dy = ev.clientY - initialPointer.y;

        // Base next position on initial modal position + total delta
        let nextX = initialPosition.x + dx;
        let nextY = initialPosition.y + dy;

        if (boundToViewport) {
          nextX = Math.min(Math.max(nextX, minX), maxX);
          nextY = Math.min(Math.max(nextY, minY), maxY);
        }

        positionRef.current = { x: nextX, y: nextY };

        if (animationFrameRef.current !== null) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        
        // Execute immediately during move for absolute minimum latency and 1:1 sync
        applyTransform(nextX, nextY);
      };

      const onPointerUp = (ev: globalThis.PointerEvent) => {
        dragging.current = false;
        
        const eventTarget = ev.target as HTMLElement;
        if (eventTarget.hasPointerCapture && eventTarget.hasPointerCapture(ev.pointerId)) {
          eventTarget.releasePointerCapture(ev.pointerId);
        }
        
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
    },
    [boundToViewport, applyTransform],
  );

  const handleProps = {
    onPointerDown,
    style: { cursor: "move", userSelect: "none" as const, touchAction: "none" as const },
  };

  return { nodeRef, handleProps };
}
