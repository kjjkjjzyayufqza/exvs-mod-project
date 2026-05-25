import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { useSceneModalViewportSuspendInteraction } from "./useSceneModalViewportSuspendInteraction";

const beginModalViewportSuspend = vi.fn();
const endModalViewportSuspend = vi.fn();

vi.mock("../store/sceneEditorStore", () => ({
  useSceneEditorStore: (selector: (state: {
    beginModalViewportSuspend: () => void;
    endModalViewportSuspend: () => void;
  }) => unknown) =>
    selector({
      beginModalViewportSuspend,
      endModalViewportSuspend,
    }),
}));

function SuspendProbe() {
  const { startViewportSuspend } = useSceneModalViewportSuspendInteraction();
  return (
    <button type="button" onPointerDown={() => startViewportSuspend()}>
      probe
    </button>
  );
}

describe("useSceneModalViewportSuspendInteraction", () => {
  beforeEach(() => {
    beginModalViewportSuspend.mockClear();
    endModalViewportSuspend.mockClear();
  });

  afterEach(() => {
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  });

  it("starts suspend once and ends on pointerup", () => {
    const { getByRole } = render(<SuspendProbe />);
    const button = getByRole("button");

    button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    expect(beginModalViewportSuspend).toHaveBeenCalledTimes(1);

    button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    expect(beginModalViewportSuspend).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    expect(endModalViewportSuspend).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    expect(endModalViewportSuspend).toHaveBeenCalledTimes(1);
  });
});
