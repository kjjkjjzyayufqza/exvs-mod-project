import { useCallback, useRef, useState, type RefObject, type PointerEvent as ReactPointerEvent } from "react";

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
  /** Current transform position. Apply via `style={{ transform: translate(${pos.x}px, ${pos.y}px) }}`. */
  position: Position;
  /** Spread onto the drag-handle element: `<div {...handleProps}>`. */
  handleProps: {
    onPointerDown: (e: ReactPointerEvent) => void;
    style: { cursor: string; userSelect: string; touchAction: string };
  };
};

/**
 * Lightweight drag hook that replaces react-draggable.
 * Uses pointer events so the delta is always in CSS-pixel space,
 * matching `transform: translate()` 1 : 1 regardless of DPI scaling.
 */
export function useDraggableModal(options: UseDraggableModalOptions = {}): UseDraggableModalReturn {
  const { defaultPosition = { x: 0, y: 0 }, boundToViewport = true } = options;
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<Position>(defaultPosition);

  const dragging = useRef(false);
  const lastPointer = useRef<Position>({ x: 0, y: 0 });

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      dragging.current = true;
      lastPointer.current = { x: e.clientX, y: e.clientY };

      const onPointerMove = (ev: globalThis.PointerEvent) => {
        if (!dragging.current) return;
        const dx = ev.clientX - lastPointer.current.x;
        const dy = ev.clientY - lastPointer.current.y;
        lastPointer.current = { x: ev.clientX, y: ev.clientY };

        setPosition((prev) => {
          let nextX = prev.x + dx;
          let nextY = prev.y + dy;

          if (boundToViewport && nodeRef.current) {
            const rect = nodeRef.current.getBoundingClientRect();
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const elW = rect.width;
            const elH = rect.height;

            const originX = rect.left - prev.x;
            const originY = rect.top - prev.y;

            const minX = -originX;
            const minY = -originY;
            const maxX = vw - originX - elW;
            const maxY = vh - originY - elH;

            nextX = Math.max(minX, Math.min(nextX, maxX));
            nextY = Math.max(minY, Math.min(nextY, maxY));
          }

          return { x: nextX, y: nextY };
        });
      };

      const onPointerUp = () => {
        dragging.current = false;
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [boundToViewport],
  );

  const handleProps = {
    onPointerDown,
    style: { cursor: "move", userSelect: "none" as const, touchAction: "none" as const },
  };

  return { nodeRef, position, handleProps };
}
