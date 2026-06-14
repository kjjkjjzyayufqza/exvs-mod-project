import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppRndModalShell } from "./AppRndModalShell";

vi.mock("react-rnd", () => ({
  Rnd: ({
    children,
    dragHandleClassName,
    enableResizing,
  }: {
    children: React.ReactNode;
    dragHandleClassName?: string;
    enableResizing?: boolean | Record<string, boolean>;
  }) => (
    <div
      data-testid="app-rnd"
      data-drag-handle={dragHandleClassName}
      data-resizable={String(enableResizing !== false)}
    >
      {children}
    </div>
  ),
}));

const DIMENSIONS = {
  width: 560,
  height: 520,
  minWidth: 280,
  minHeight: 260,
};

describe("AppRndModalShell", () => {
  it("renders header actions and closes from the shared header", () => {
    const onClose = vi.fn();
    render(
      <AppRndModalShell
        titleId="test-modal-title"
        title="Texture preview"
        subtitle="Preview details"
        dimensions={DIMENSIONS}
        headerActions={<button type="button">Zoom in</button>}
        onClose={onClose}
      >
        <div>Body content</div>
      </AppRndModalShell>,
    );

    expect(screen.getByText("Zoom in")).toBeInTheDocument();
    expect(screen.getByText("Body content")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("passes disabled resizing to react-rnd", () => {
    render(
      <AppRndModalShell
        titleId="fixed-modal-title"
        title="Fixed modal"
        dimensions={DIMENSIONS}
        onClose={() => {}}
        resizable={false}
      >
        <div>Fixed body</div>
      </AppRndModalShell>,
    );

    expect(screen.getByTestId("app-rnd")).toHaveAttribute("data-resizable", "false");
  });
});
