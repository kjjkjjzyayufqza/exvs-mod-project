import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useSceneEditorStore } from "../store/sceneEditorStore";

/** Pauses the R3F viewport for the duration of a modal pointer interaction. */
export function useSceneModalViewportSuspendInteraction() {
  const beginViewportSuspend = useSceneEditorStore((state) => state.beginModalViewportSuspend);
  const endViewportSuspend = useSceneEditorStore((state) => state.endModalViewportSuspend);
  const activeRef = useRef(false);

  const startViewportSuspend = useCallback(() => {
    if (activeRef.current) return;
    activeRef.current = true;
    beginViewportSuspend();
  }, [beginViewportSuspend]);

  const stopViewportSuspend = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    endViewportSuspend();
  }, [endViewportSuspend]);

  const onDragHandlePointerDownCapture = useCallback(
    (event: ReactPointerEvent) => {
      if (event.button !== 0) return;
      if (event.target instanceof HTMLElement && event.target.closest("button")) return;
      startViewportSuspend();
    },
    [startViewportSuspend],
  );

  useEffect(() => {
    const onPointerEnd = () => {
      stopViewportSuspend();
    };

    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);
    return () => {
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      stopViewportSuspend();
    };
  }, [stopViewportSuspend]);

  return { startViewportSuspend, stopViewportSuspend, onDragHandlePointerDownCapture };
}
