import { beforeEach, describe, expect, it } from "vitest";
import { useFloatingWindowStore } from "./floatingWindowStore";

function reset() {
  useFloatingWindowStore.setState({ counter: 0, zById: {}, topId: null });
}

describe("floatingWindowStore", () => {
  beforeEach(reset);

  it("assigns a monotonically increasing z on bringToFront", () => {
    const { bringToFront } = useFloatingWindowStore.getState();
    const z1 = bringToFront("a");
    const z2 = bringToFront("b");
    expect(z2).toBeGreaterThan(z1);
  });

  it("records the focused window as topId", () => {
    const { bringToFront } = useFloatingWindowStore.getState();
    bringToFront("a");
    bringToFront("b");
    expect(useFloatingWindowStore.getState().topId).toBe("b");
  });

  it("re-focusing a window raises it above the others", () => {
    const { bringToFront } = useFloatingWindowStore.getState();
    bringToFront("a");
    bringToFront("b");
    bringToFront("a");
    const { zById, topId } = useFloatingWindowStore.getState();
    expect(topId).toBe("a");
    expect(zById["a"]).toBeGreaterThan(zById["b"]);
  });

  it("recomputes topId to the remaining max when the top window is released", () => {
    const { bringToFront, release } = useFloatingWindowStore.getState();
    bringToFront("a");
    bringToFront("b");
    release("b");
    const { topId, zById } = useFloatingWindowStore.getState();
    expect(topId).toBe("a");
    expect(zById["b"]).toBeUndefined();
  });

  it("keeps topId when a non-top window is released", () => {
    const { bringToFront, release } = useFloatingWindowStore.getState();
    bringToFront("a");
    bringToFront("b");
    release("a");
    expect(useFloatingWindowStore.getState().topId).toBe("b");
  });

  it("sets topId to null when the last window is released", () => {
    const { bringToFront, release } = useFloatingWindowStore.getState();
    bringToFront("a");
    release("a");
    expect(useFloatingWindowStore.getState().topId).toBeNull();
  });

  it("is a no-op to release an unknown id", () => {
    const { bringToFront, release } = useFloatingWindowStore.getState();
    bringToFront("a");
    release("ghost");
    const { topId, zById } = useFloatingWindowStore.getState();
    expect(topId).toBe("a");
    expect(zById["a"]).toBeDefined();
  });
});
