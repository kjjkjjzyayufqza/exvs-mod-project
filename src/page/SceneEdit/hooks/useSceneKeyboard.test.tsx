import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useSceneKeyboard } from "./useSceneKeyboard";

function Harness({ onUndo, onRedo }: { onUndo?: () => boolean; onRedo?: () => boolean }) {
  useSceneKeyboard({ onUndo, onRedo });
  return <canvas />;
}

describe("useSceneKeyboard mission history", () => {
  it("undoes a mission spawn edit from the viewport before the scene stack", () => {
    const onUndo = vi.fn(() => true);
    const onRedo = vi.fn(() => true);
    render(<Harness onUndo={onUndo} onRedo={onRedo} />);

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(window, { key: "y", ctrlKey: true });

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).toHaveBeenCalledTimes(2);
  });

  it("falls through when the mission graph has nothing to undo", () => {
    const onUndo = vi.fn(() => false);
    render(<Harness onUndo={onUndo} />);

    fireEvent.keyDown(window, { key: "Z", ctrlKey: true });

    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});
