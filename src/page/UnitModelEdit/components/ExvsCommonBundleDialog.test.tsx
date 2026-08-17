import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exists: vi.fn(),
  resolve: vi.fn(),
  extract: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({ exists: mocks.exists }));
vi.mock("@/store/configStore", () => ({
  useConfigStore: (selector: (state: Record<string, string>) => unknown) =>
    selector({
      extractOutputPath: "E:\\workspace",
      obDplCachePath: "E:\\dplcache",
      obModPath: "E:\\mod",
    }),
}));
vi.mock("../utils/exvsCommonService", () => ({
  resolveExvsCommonBundlePaths: mocks.resolve,
  extractExvsCommonBundle: mocks.extract,
}));

import { ExvsCommonBundleDialog } from "./ExvsCommonBundleDialog";

const paths = {
  sourceFhm2d: "E:\\dplcache\\0xCB665375.fhm2d",
  modelRoot: "E:\\workspace\\002chara\\000common_000common_001",
  structureJson:
    "E:\\workspace\\002chara\\000common_000common_001_structure.json",
  modFhm2d: "E:\\mod\\0xCB665375.fhm2d",
};

describe("ExvsCommonBundleDialog", () => {
  beforeEach(() => {
    mocks.exists.mockReset().mockResolvedValue(true);
    mocks.resolve.mockReset().mockResolvedValue(paths);
    mocks.extract.mockReset().mockResolvedValue({
      modelRoot: paths.modelRoot,
      uniquePhysicalFiles: 43,
      logicalReferenceCount: 48,
      backupModelRoot: "E:\\workspace\\002chara\\common_backup",
    });
  });

  it("opens an existing workspace without extracting", async () => {
    const user = userEvent.setup();
    const onOpened = vi.fn();
    render(
      <ExvsCommonBundleDialog open onOpenChange={vi.fn()} onOpened={onOpened} />,
    );
    await user.click(await screen.findByRole("button", { name: /open existing/i }));
    expect(onOpened).toHaveBeenCalledWith(paths.modelRoot);
    expect(mocks.extract).not.toHaveBeenCalled();
  });

  it("re-extracts with overwrite so Rust creates a backup", async () => {
    const user = userEvent.setup();
    const onOpened = vi.fn();
    render(
      <ExvsCommonBundleDialog open onOpenChange={vi.fn()} onOpened={onOpened} />,
    );
    await user.click(await screen.findByRole("button", { name: /re-extract/i }));
    await waitFor(() =>
      expect(mocks.extract).toHaveBeenCalledWith({
        extractOutputPath: "E:\\workspace",
        obDplCachePath: "E:\\dplcache",
        overwrite: true,
      }),
    );
    expect(onOpened).toHaveBeenCalledWith(paths.modelRoot);
  });
});
