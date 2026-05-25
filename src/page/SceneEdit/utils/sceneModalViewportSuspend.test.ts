import { describe, expect, it, beforeEach } from "vitest";
import { useSceneEditorStore } from "../store/sceneEditorStore";

describe("scene modal viewport suspend", () => {
  beforeEach(() => {
    useSceneEditorStore.setState({ modalViewportSuspendCount: 0 });
  });

  it("tracks nested suspend/resume with a ref count", () => {
    const store = useSceneEditorStore.getState();
    store.beginModalViewportSuspend();
    expect(useSceneEditorStore.getState().modalViewportSuspendCount).toBe(1);
    expect(useSceneEditorStore.getState().isModalViewportSuspended()).toBe(true);

    store.beginModalViewportSuspend();
    expect(useSceneEditorStore.getState().modalViewportSuspendCount).toBe(2);

    store.endModalViewportSuspend();
    expect(useSceneEditorStore.getState().modalViewportSuspendCount).toBe(1);
    expect(useSceneEditorStore.getState().isModalViewportSuspended()).toBe(true);

    store.endModalViewportSuspend();
    expect(useSceneEditorStore.getState().modalViewportSuspendCount).toBe(0);
    expect(useSceneEditorStore.getState().isModalViewportSuspended()).toBe(false);
  });

  it("does not decrement below zero", () => {
    useSceneEditorStore.getState().endModalViewportSuspend();
    expect(useSceneEditorStore.getState().modalViewportSuspendCount).toBe(0);
  });
});
