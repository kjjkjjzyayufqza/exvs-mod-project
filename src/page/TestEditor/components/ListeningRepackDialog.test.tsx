import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ListeningRepackDialog from "./ListeningRepackDialog";

const { existsMock } = vi.hoisted(() => ({
  existsMock: vi.fn(async () => true),
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: vi.fn(async (...parts: string[]) => parts.join("/")),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: existsMock,
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 68,
    getVirtualItems: () =>
      Array.from({ length: Math.min(count, 3) }, (_, index) => ({
        index,
        key: index,
        start: index * 68,
      })),
    measureElement: vi.fn(),
  }),
}));

vi.mock("@/components/AppRndModalShell", () => ({
  AppRndModalShell: ({
    children,
    footer,
  }: {
    children: React.ReactNode;
    footer?: React.ReactNode;
  }) => (
    <div>
      {children}
      {footer}
    </div>
  ),
}));

vi.mock("@/utils/repackRunner", () => ({
  repackFolderUsingStructureToModFolder: vi.fn(),
}));

vi.mock("../utils/modVgsht2", () => ({
  removeMatchingModVgsht2: vi.fn(),
}));

describe("ListeningRepackDialog", () => {
  it("checks all folders but mounts only virtual rows", async () => {
    const dirtyFolders = Array.from({ length: 20 }, (_, index) => `folder-${index}`);

    render(
      <ListeningRepackDialog
        open
        rootDir="C:/workspace"
        dirtyFolders={dirtyFolders}
        modFolderPath="C:/mod"
        onOpenChange={() => {}}
        onFolderRepacked={() => {}}
      />,
    );

    await waitFor(() => expect(existsMock).toHaveBeenCalledTimes(20));
    expect(screen.getByText("folder-0")).toBeInTheDocument();
    expect(screen.getByText("folder-2")).toBeInTheDocument();
    expect(screen.queryByText("folder-10")).not.toBeInTheDocument();
  });
});
