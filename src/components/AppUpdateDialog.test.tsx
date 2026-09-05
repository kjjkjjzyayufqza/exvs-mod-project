import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppUpdateDialog } from "./AppUpdateDialog";

vi.mock("react-rnd", () => ({
  Rnd: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("AppUpdateDialog", () => {
  it("shows the GitHub version and changelog and lets the user skip or update", () => {
    const onSkip = vi.fn();
    const onUpdate = vi.fn();
    render(
      <AppUpdateDialog
        currentVersion="0.1.8"
        latestVersion="0.1.12"
        changelog={"- Fixed NSIS extra bins\n- Launch updater dialog"}
        installing={false}
        progressPercent={null}
        errorMessage={null}
        onSkip={onSkip}
        onUpdate={onUpdate}
      />,
    );

    expect(screen.getByRole("heading", { name: "Update available" })).toBeInTheDocument();
    expect(screen.getByText("Version 0.1.12 is ready")).toBeInTheDocument();
    expect(screen.getByText("Installed version: 0.1.8")).toBeInTheDocument();
    expect(screen.getByText(/Fixed NSIS extra bins/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(onSkip).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Update now" }));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("disables skip while installing and surfaces an empty changelog", () => {
    render(
      <AppUpdateDialog
        currentVersion="0.1.0"
        latestVersion="0.1.1"
        changelog="  "
        installing
        progressPercent={40}
        errorMessage={null}
        onSkip={() => {}}
        onUpdate={() => {}}
      />,
    );

    expect(screen.getByText("No release notes were published for this version.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "40%" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Not now" })).toBeDisabled();
  });
});
