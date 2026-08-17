import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/AppRndModalShell", () => ({
  AppRndModalShell: ({
    children,
    footer,
    title,
  }: {
    children: React.ReactNode;
    footer?: React.ReactNode;
    title: string;
  }) => (
    <div>
      <h1>{title}</h1>
      {children}
      <footer>{footer}</footer>
    </div>
  ),
}));

import { ExvsCommonModelIdDialog } from "./ExvsCommonModelIdDialog";

describe("ExvsCommonModelIdDialog", () => {
  it("confirms a parsed hex model ID from the resize modal", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ExvsCommonModelIdDialog
        open
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: "Runtime model ID" })).toBeTruthy();
    expect(screen.queryByText(/Enter a unique runtime u32 model ID/i)).toBeNull();
    await user.type(screen.getByLabelText("Model ID"), "0x48415431");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(onConfirm).toHaveBeenCalledWith(0x48415431, "0x48415431");
  });
});
