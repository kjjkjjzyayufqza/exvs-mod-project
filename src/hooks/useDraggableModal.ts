import { useCallback, useRef, useLayoutEffect, type RefObject, type PointerEvent as ReactPointerEvent } from "react";

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
    style: { cursor: "move"; userSelect: "none"; touchAction: "none" };
  };
};

/**
 * Lightweight drag hook that replaces react-draggable.
 * Uses pointer events so the delta is always in CSS-pixel space.
 * Modifies the DOM directly instead of using React state for dragging, 
 * which avoids re-renders and drastically improves performance.
 *
 * Uses left/top instead of transform so nested overflow scrolling inside the
 * dialog works reliably (transform creates a containing layer that breaks wheel
 * scrolling in some browsers).
 */
export function useDraggableModal(options: UseDraggableModalOptions = {}): UseDraggableModalReturn {
  const { defaultPosition = { x: 0, y: 0 }, boundToViewport = true } = options;
  const nodeRef = useRef<HTMLDivElement | null>(null);
  
  const positionRef = useRef<Position>(defaultPosition);
  const dragging = useRef(false);

  const applyPosition = useCallback((x: number, y: number) => {
    if (nodeRef.current) {
      const el = nodeRef.current;
      el.style.transform = "";
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    }
  }, []);

  useLayoutEffect(() => {
    if (!dragging.current) {
      applyPosition(positionRef.current.x, positionRef.current.y);
    }
  }, [applyPosition]);

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

      // Defer viewport bounds until the first move to avoid forced reflow on pointerdown.
      let minX = -Infinity;
      let minY = -Infinity;
      let maxX = Infinity;
      let maxY = Infinity;
      let boundsReady = !boundToViewport;

      const ensureBounds = () => {
        if (boundsReady || !nodeRef.current) return;
        const rect = nodeRef.current.getBoundingClientRect();
        const vw = document.documentElement.clientWidth || window.innerWidth;
        const vh = document.documentElement.clientHeight || window.innerHeight;

        minX = initialPosition.x - rect.left;
        minY = initialPosition.y - rect.top;
        maxX = Math.max(minX, initialPosition.x + (vw - rect.right));
        maxY = Math.max(minY, initialPosition.y + (vh - rect.bottom));
        boundsReady = true;
      };

      const onPointerMove = (ev: globalThis.PointerEvent) => {
        if (!dragging.current) return;

        if (boundToViewport) {
          ensureBounds();
        }
        
        // Calculate delta from initial pointer position
        const dx = ev.clientX - initialPointer.x;
        const dy = ev.clientY - initialPointer.y;

        // Base next position on initial modal position + total delta
        let nextX = initialPosition.x + dx;
        let nextY = initialPosition.y + dy;

        if (boundToViewport && boundsReady) {
          nextX = Math.min(Math.max(nextX, minX), maxX);
          nextY = Math.min(Math.max(nextY, minY), maxY);
        }

        positionRef.current = { x: nextX, y: nextY };
        applyPosition(nextX, nextY);
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
    [boundToViewport, applyPosition],
  );

  const handleProps = {
    onPointerDown,
    style: {
      cursor: "move" as const,
      userSelect: "none" as const,
      touchAction: "none" as const,
    },
  };

  return { nodeRef, handleProps };
}
