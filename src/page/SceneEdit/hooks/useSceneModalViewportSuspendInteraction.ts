import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useSceneEditorStore } from "../store/sceneEditorStore";

/**
 * Pluggable "pause the host 3D viewport during a modal pointer interaction"
 * contract consumed by `SceneEditRndModalShell`. The Scene Editor backs it with
 * its store; other hosts inject a callback-backed implementation so the shell
 * stays decoupled from any single viewport store.
 */
export type ModalViewportSuspendInteraction = {
  startViewportSuspend: () => void;
  stopViewportSuspend: () => void;
  onDragHandlePointerDownCapture: (event: ReactPointerEvent) => void;
};

/** Pauses the Scene Editor R3F viewport for the duration of a modal pointer interaction. */
export function useSceneModalViewportSuspendInteraction(): ModalViewportSuspendInteraction {
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

/**
 * Callback-backed variant of {@link useSceneModalViewportSuspendInteraction} for
 * hosts whose viewport is not the Scene Editor store (e.g. the Unit Model
 * Editor's SSBH preview). Toggles `onSuspendChange(true/false)` around modal
 * drag/resize interactions, releasing on pointer-up/cancel.
 */
export function useCallbackModalViewportSuspendInteraction(
  onSuspendChange?: (suspended: boolean) => void,
): ModalViewportSuspendInteraction {
  const activeRef = useRef(false);
  const callbackRef = useRef(onSuspendChange);
  callbackRef.current = onSuspendChange;

  const startViewportSuspend = useCallback(() => {
    if (activeRef.current) return;
    activeRef.current = true;
    callbackRef.current?.(true);
  }, []);

  const stopViewportSuspend = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    callbackRef.current?.(false);
  }, []);

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
