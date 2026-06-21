import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UnitModelRemoveModelModal } from "./UnitModelRemoveModelModal";

describe("UnitModelRemoveModelModal", () => {
  it("requires a second confirmation step before calling onConfirm", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <UnitModelRemoveModelModal
        open
        modelLabel="alpha"
        busy={false}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText("Remove model?")).toBeInTheDocument();
    expect(screen.queryByText("Permanently remove model?")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("Permanently remove model?")).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Permanently remove" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("resets to the first step when the dialog closes", () => {
    const { rerender } = render(
      <UnitModelRemoveModelModal
        open
        modelLabel="alpha"
        busy={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Permanently remove model?")).toBeInTheDocument();

    rerender(
      <UnitModelRemoveModelModal
        open={false}
        modelLabel="alpha"
        busy={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    rerender(
      <UnitModelRemoveModelModal
        open
        modelLabel="alpha"
        busy={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Remove model?")).toBeInTheDocument();
    expect(screen.queryByText("Permanently remove model?")).not.toBeInTheDocument();
  });
});
