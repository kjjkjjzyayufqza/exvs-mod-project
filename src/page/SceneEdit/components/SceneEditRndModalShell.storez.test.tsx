import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { SceneEditRndModalShell } from "./SceneEditRndModalShell";
import { useFloatingWindowStore } from "@/store/floatingWindowStore";
import type { ModalViewportSuspendInteraction } from "./SceneEditRndModalShell";

const NOOP_SUSPEND: ModalViewportSuspendInteraction = {
  startViewportSuspend: () => {},
  stopViewportSuspend: () => {},
  onDragHandlePointerDownCapture: () => {},
};

function getDimensions() {
  return { width: 400, height: 300, minWidth: 200, minHeight: 150, maxWidth: 800, maxHeight: 600 };
}

function renderShell(windowId: string, title: string) {
  return render(
    <SceneEditRndModalShell
      windowId={windowId}
      cascadeIndex={0}
      zIndex={1000}
      titleId={`${windowId}-title`}
      title={title}
      subtitle="sub"
      headerIcon={null}
      onActivate={() => {}}
      onClose={() => {}}
      getDimensions={getDimensions}
      viewportSuspend={NOOP_SUSPEND}
    >
      <div>{title} body</div>
    </SceneEditRndModalShell>,
  );
}

describe("SceneEditRndModalShell — unified z-order", () => {
  beforeEach(() => {
    useFloatingWindowStore.setState({ counter: 0, zById: {}, topId: null });
  });

  it("brings the most recently mounted window to the front", () => {
    renderShell("w1", "Win 1");
    renderShell("w2", "Win 2");
    expect(useFloatingWindowStore.getState().topId).toBe("w2");
  });

  it("brings a window to the front on pointer down anywhere in its body", () => {
    renderShell("w1", "Win 1");
    renderShell("w2", "Win 2");

    fireEvent.pointerDown(screen.getByText("Win 1 body"));

    const { topId, zById } = useFloatingWindowStore.getState();
    expect(topId).toBe("w1");
    expect(zById["w1"]).toBeGreaterThan(zById["w2"]);
  });
});
