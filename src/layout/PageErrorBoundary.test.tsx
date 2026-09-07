import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PageErrorBoundary } from "./PageErrorBoundary";

function Boom({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("unit-model boom");
  }
  return <div data-testid="safe-page">safe</div>;
}

describe("PageErrorBoundary", () => {
  it("renders a retryable fallback instead of unmounting siblings", async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { rerender } = render(
      <div>
        <div data-testid="shell">shell</div>
        <PageErrorBoundary resetKey="unit-model">
          <Boom shouldThrow />
        </PageErrorBoundary>
      </div>,
    );

    expect(screen.getByTestId("shell")).toBeInTheDocument();
    expect(screen.queryByTestId("safe-page")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();

    rerender(
      <div>
        <div data-testid="shell">shell</div>
        <PageErrorBoundary resetKey="unit-model">
          <Boom shouldThrow={false} />
        </PageErrorBoundary>
      </div>,
    );
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByTestId("safe-page")).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
