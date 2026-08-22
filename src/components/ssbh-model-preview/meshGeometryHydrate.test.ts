import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hydrateBundleGeometry } from "./meshGeometryHydrate";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("hydrateBundleGeometry", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it("coalesces concurrent hydration of the same one-shot geometry buffer", async () => {
    let release: ((buffer: ArrayBuffer) => void) | null = null;
    vi.mocked(invoke).mockImplementationOnce(
      () => new Promise<ArrayBuffer>((resolve) => {
        release = resolve;
      }),
    ).mockRejectedValueOnce(
      new Error("Mesh geometry buffer not found or already consumed: geom-107"),
    );
    const bundle = {
      mesh: {
        binary: true,
        geometryId: "geom-107",
        objects: [],
      },
    };

    const first = hydrateBundleGeometry(bundle);
    const second = hydrateBundleGeometry(bundle);
    release?.(new ArrayBuffer(0));

    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
