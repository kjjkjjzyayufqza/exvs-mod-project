import { useLayoutEffect } from "react";
import { useThree } from "@react-three/fiber";
import { useSceneEditorStore } from "../store/sceneEditorStore";

/** Pauses R3F while Scene Edit modals are dragged or resized. */
export function ViewportFrameLoopGate() {
  const suspended = useSceneEditorStore((state) => state.modalViewportSuspendCount > 0);
  const set = useThree((state) => state.set);
  const invalidate = useThree((state) => state.invalidate);

  useLayoutEffect(() => {
    set({ frameloop: suspended ? "never" : "demand" });
    if (!suspended) {
      invalidate();
    }
  }, [suspended, set, invalidate]);

  return null;
}
