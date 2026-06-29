import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspacePackIdentity } from "@/services/testEditorWorkspace/types";
import ListeningRepackDialog from "./ListeningRepackDialog";

const { existsMock } = vi.hoisted(() => ({
  existsMock: vi.fn(async () => true),
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

vi.mock("@/utils/fhm2dStructureMetadata", () => ({
  promptAndMigrateFhm2dStructureIfNeeded: vi.fn(async () => null),
}));

vi.mock("../utils/modVgsht2", () => ({
  removeMatchingModVgsht2: vi.fn(),
}));

function pack(packKey: string, folderPath: string): WorkspacePackIdentity {
  const hashFolderName = folderPath.split(/[\\/]/).pop() ?? packKey;
  const parentPath = folderPath.slice(0, -hashFolderName.length).replace(/[\\/]+$/, "");
  return {
    packKey,
    routeId: null,
    prefix: packKey.includes("/") ? packKey.slice(0, packKey.lastIndexOf("/")) : "",
    hashFolderName,
    folderPath,
    structureJsonPath: `${parentPath}/${hashFolderName}_structure.json`,
    sourceLayout: packKey.includes("/") ? "configured" : "legacy",
  };
}

describe("ListeningRepackDialog", () => {
  it("checks all packs but mounts only virtual rows", async () => {
    const dirtyPacks = Array.from({ length: 20 }, (_, index) =>
      pack(`002chara/0x123456${String(index).padStart(2, "0")}`, `C:/workspace/002chara/0x123456${String(index).padStart(2, "0")}`),
    );

    render(
      <ListeningRepackDialog
        open
        dirtyPacks={dirtyPacks}
        modFolderPath="C:/mod"
        onOpenChange={() => {}}
        onPackRepacked={() => {}}
      />,
    );

    await waitFor(() => expect(existsMock).toHaveBeenCalledTimes(20));
    expect(screen.getByText("002chara/0x12345600")).toBeInTheDocument();
    expect(screen.getByText("002chara/0x12345602")).toBeInTheDocument();
    expect(screen.queryByText("002chara/0x12345610")).not.toBeInTheDocument();
  });

  it("keeps duplicate hashes under different prefixes distinct", async () => {
    render(
      <ListeningRepackDialog
        open
        dirtyPacks={[
          pack("002chara/0x12345678", "C:/workspace/002chara/0x12345678"),
          pack("006effect/0x12345678", "C:/workspace/006effect/0x12345678"),
        ]}
        modFolderPath="C:/mod"
        onOpenChange={() => {}}
        onPackRepacked={() => {}}
      />,
    );

    expect(await screen.findByText("002chara/0x12345678")).toBeInTheDocument();
    expect(screen.getByText("006effect/0x12345678")).toBeInTheDocument();
  });
});
