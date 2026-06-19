import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_TEST_EDITOR_WORKSPACE } from "@/services/testEditorWorkspace/defaults";
import type { UseTestEditorWorkspaceResult } from "@/hooks/useTestEditorWorkspace";
import { WorkspaceLayoutDialog } from "./WorkspaceLayoutDialog";

vi.mock("@/components/AppRndModalShell", () => ({
  AppRndModalShell: ({
    title,
    children,
    footer,
    onClose,
  }: {
    title: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
    onClose: () => void;
  }) => (
    <section role="dialog" aria-label={title}>
      {children}
      {footer}
      <button type="button" onClick={onClose}>
        Close
      </button>
    </section>
  ),
}));

function controllerFixture(
  overrides: Partial<UseTestEditorWorkspaceResult> = {},
): UseTestEditorWorkspaceResult {
  return {
    workspaceRoot: "E:/workspace",
    document: DEFAULT_TEST_EDITOR_WORKSPACE,
    source: "defaults",
    issues: [],
    routeRoots: {},
    isLoading: false,
    isSaving: false,
    error: null,
    reload: vi.fn(),
    save: vi.fn(),
    ...overrides,
  };
}

describe("WorkspaceLayoutDialog", () => {
  it("renders configured route rows", () => {
    render(
      <WorkspaceLayoutDialog
        open
        controller={controllerFixture()}
        onOpenChange={() => {}}
      />,
    );

    expect(screen.getByLabelText("Character Model prefix")).toHaveValue("002chara");
    expect(screen.getByText("unit.model")).toBeInTheDocument();
    expect(screen.getByLabelText("Character Effect prefix")).toHaveValue("006effect");
  });

  it("blocks save when a prefix traverses outside the workspace", async () => {
    const user = userEvent.setup();

    render(
      <WorkspaceLayoutDialog
        open
        controller={controllerFixture()}
        onOpenChange={() => {}}
      />,
    );

    await user.clear(screen.getByLabelText("Character Model prefix"));
    await user.type(screen.getByLabelText("Character Model prefix"), "../outside");

    expect(screen.getByRole("button", { name: "Save layout" })).toBeDisabled();
  });

  it("resets one route prefix to the default", async () => {
    const user = userEvent.setup();

    render(
      <WorkspaceLayoutDialog
        open
        controller={controllerFixture()}
        onOpenChange={() => {}}
      />,
    );

    await user.clear(screen.getByLabelText("Character Model prefix"));
    await user.type(screen.getByLabelText("Character Model prefix"), "custom/chara");
    await user.click(screen.getByRole("button", { name: "Reset Character Model prefix" }));

    expect(screen.getByLabelText("Character Model prefix")).toHaveValue("002chara");
  });

  it("saves a complete version 1 workspace document", async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();

    render(
      <WorkspaceLayoutDialog
        open
        controller={controllerFixture({ save })}
        onOpenChange={onOpenChange}
      />,
    );

    await user.clear(screen.getByLabelText("Character Model prefix"));
    await user.type(screen.getByLabelText("Character Model prefix"), "custom/chara");
    await user.click(screen.getByRole("button", { name: "Save layout" }));

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 1,
        legacyReadFallback: true,
        assetRoutes: expect.objectContaining({
          "unit.model": expect.objectContaining({ prefix: "custom/chara" }),
          "unit.effect": expect.objectContaining({ prefix: "006effect" }),
        }),
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
