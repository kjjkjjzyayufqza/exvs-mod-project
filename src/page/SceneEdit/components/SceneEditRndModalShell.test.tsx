import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SceneEditRndModalShell } from "./SceneEditRndModalShell";
import { getEffectDetailViewModalDimensions, SCENE_EDIT_RND_DRAG_HANDLE } from "./sceneEditRndModalUtils";

const beginModalViewportSuspend = vi.fn();
const endModalViewportSuspend = vi.fn();

vi.mock("../hooks/useSceneModalViewportSuspendInteraction", () => ({
  useSceneModalViewportSuspendInteraction: () => ({
    startViewportSuspend: beginModalViewportSuspend,
    stopViewportSuspend: endModalViewportSuspend,
    onDragHandlePointerDownCapture: (event: { button: number; target: EventTarget | null }) => {
      if (event.button !== 0) return;
      if (event.target instanceof HTMLElement && event.target.closest("button")) return;
      beginModalViewportSuspend();
    },
  }),
}));

vi.mock("react-rnd", () => ({
  Rnd: ({
    children,
    dragHandleClassName,
    className,
    bounds,
    cancel,
    position,
    onDragStart,
  }: {
    children: React.ReactNode;
    dragHandleClassName?: string;
    className?: string;
    bounds?: string;
    cancel?: string;
    position?: { x: number; y: number };
    onDragStart?: () => void;
  }) => (
    <div
      data-testid="scene-edit-rnd"
      data-drag-handle={dragHandleClassName}
      data-bounds={bounds}
      data-cancel={cancel}
      data-position={position ? `${position.x},${position.y}` : ""}
      className={className}
      onDragStart={onDragStart}
    >
      {children}
    </div>
  ),
}));

describe("SceneEditRndModalShell", () => {
  beforeEach(() => {
    beginModalViewportSuspend.mockClear();
    endModalViewportSuspend.mockClear();
    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback) => {
        setTimeout(cb, 0);
        return 0;
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders react-rnd with shared drag handle and bounds", () => {
    render(
      <SceneEditRndModalShell
        cascadeIndex={0}
        zIndex={100}
        titleId="test-title"
        title="Properties — node"
        subtitle="SSBH Model Detail View"
        onActivate={() => {}}
        onClose={() => {}}
        getDimensions={getEffectDetailViewModalDimensions}
        headerIcon={<span data-testid="icon" />}
      >
        <div>Body content</div>
      </SceneEditRndModalShell>,
    );

    const rnd = screen.getByTestId("scene-edit-rnd");
    expect(rnd).toHaveAttribute("data-drag-handle", SCENE_EDIT_RND_DRAG_HANDLE);
    expect(rnd).toHaveAttribute("data-bounds", "parent");
    expect(screen.getByText("Body content")).toBeInTheDocument();
    expect(screen.getByText("Properties — node")).toBeInTheDocument();
  });

  it("suspends viewport on drag handle pointerdown capture", () => {
    render(
      <SceneEditRndModalShell
        cascadeIndex={0}
        zIndex={100}
        titleId="test-title"
        title="Properties — node"
        subtitle="SSBH Model Detail View"
        onActivate={() => {}}
        onClose={() => {}}
        getDimensions={getEffectDetailViewModalDimensions}
        headerIcon={<span />}
      >
        <div>Body content</div>
      </SceneEditRndModalShell>,
    );

    fireEvent.pointerDown(screen.getByText("Properties — node"), { button: 0 });
    expect(beginModalViewportSuspend).toHaveBeenCalledTimes(1);
  });

  it("does not activate on drag handle pointerdown", async () => {
    const onActivate = vi.fn();
    render(
      <SceneEditRndModalShell
        cascadeIndex={0}
        zIndex={100}
        titleId="test-title"
        title="Properties — node"
        subtitle="SSBH Model Detail View"
        onActivate={onActivate}
        onClose={() => {}}
        getDimensions={getEffectDetailViewModalDimensions}
        headerIcon={<span />}
      >
        <div>Body content</div>
      </SceneEditRndModalShell>,
    );

    fireEvent.pointerDown(screen.getByText("Properties — node"));
    fireEvent.click(screen.getByText("Properties — node"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("defers activation until after drag start", async () => {
    const onActivate = vi.fn();
    render(
      <SceneEditRndModalShell
        cascadeIndex={0}
        zIndex={100}
        titleId="test-title"
        title="Properties — node"
        subtitle="SSBH Model Detail View"
        onActivate={onActivate}
        onClose={() => {}}
        getDimensions={getEffectDetailViewModalDimensions}
        headerIcon={<span />}
      >
        <div>Body content</div>
      </SceneEditRndModalShell>,
    );

    fireEvent.dragStart(screen.getByTestId("scene-edit-rnd"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("activates when click hits modal body", async () => {
    const onActivate = vi.fn();
    render(
      <SceneEditRndModalShell
        cascadeIndex={0}
        zIndex={100}
        titleId="test-title"
        title="Properties — node"
        subtitle="SSBH Model Detail View"
        onActivate={onActivate}
        onClose={() => {}}
        getDimensions={getEffectDetailViewModalDimensions}
        headerIcon={<span />}
      >
        <div>Body content</div>
      </SceneEditRndModalShell>,
    );

    fireEvent.click(screen.getByText("Body content"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("skips activation when already topmost", async () => {
    const onActivate = vi.fn();
    render(
      <SceneEditRndModalShell
        cascadeIndex={0}
        zIndex={100}
        titleId="test-title"
        title="Properties — node"
        subtitle="SSBH Model Detail View"
        skipActivate
        onActivate={onActivate}
        onClose={() => {}}
        getDimensions={getEffectDetailViewModalDimensions}
        headerIcon={<span />}
      >
        <div>Body content</div>
      </SceneEditRndModalShell>,
    );

    fireEvent.click(screen.getByText("Body content"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("calls onClose when the header close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <SceneEditRndModalShell
        cascadeIndex={0}
        zIndex={100}
        titleId="test-title"
        title="Properties — node"
        subtitle="SSBH Model Detail View"
        onActivate={() => {}}
        onClose={onClose}
        getDimensions={getEffectDetailViewModalDimensions}
        headerIcon={<span />}
      >
        <div>Body content</div>
      </SceneEditRndModalShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("uses a custom initial position when supplied", () => {
    render(
      <SceneEditRndModalShell
        cascadeIndex={0}
        zIndex={100}
        titleId="test-title"
        title="Centered modal"
        subtitle="Custom position"
        onActivate={() => {}}
        onClose={() => {}}
        getDimensions={getEffectDetailViewModalDimensions}
        getInitialPosition={() => ({ x: 240, y: 160 })}
        headerIcon={<span />}
      >
        <div>Body content</div>
      </SceneEditRndModalShell>,
    );

    expect(screen.getByTestId("scene-edit-rnd")).toHaveAttribute("data-position", "240,160");
  });
});
