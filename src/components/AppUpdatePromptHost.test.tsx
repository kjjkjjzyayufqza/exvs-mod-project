import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppUpdatePromptHost } from "./AppUpdatePromptHost";

vi.mock("react-rnd", () => ({
  Rnd: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const loadAppUpdatePrompt = vi.fn();
vi.mock("@/lib/appUpdater", async () => {
  const actual = await vi.importActual<typeof import("@/lib/appUpdater")>("@/lib/appUpdater");
  return {
    ...actual,
    loadAppUpdatePrompt: (...args: unknown[]) => loadAppUpdatePrompt(...args),
    installAppUpdate: vi.fn(),
  };
});

describe("AppUpdatePromptHost", () => {
  afterEach(() => {
    cleanup();
    loadAppUpdatePrompt.mockReset();
  });

  it("opens the update dialog when GitHub reports a newer version", async () => {
    loadAppUpdatePrompt.mockResolvedValue({
      update: { version: "0.1.12" },
      currentVersion: "0.1.8",
      latestVersion: "0.1.12",
      changelog: "Fixed NSIS extra bins",
    });

    render(<AppUpdatePromptHost enabled />);

    expect(await screen.findByRole("heading", { name: "Update available" })).toBeInTheDocument();
    expect(screen.getByText("Fixed NSIS extra bins")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update now" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not now" })).toBeInTheDocument();
  });

  it("stays silent when checking is disabled or no update exists", async () => {
    loadAppUpdatePrompt.mockResolvedValue(null);
    const { rerender } = render(<AppUpdatePromptHost enabled={false} />);
    expect(loadAppUpdatePrompt).not.toHaveBeenCalled();
    rerender(<AppUpdatePromptHost enabled />);
    await waitFor(() => expect(loadAppUpdatePrompt).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("heading", { name: "Update available" })).not.toBeInTheDocument();
  });
});
