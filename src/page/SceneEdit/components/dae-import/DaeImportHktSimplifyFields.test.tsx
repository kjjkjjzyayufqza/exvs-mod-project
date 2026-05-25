import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { DaeImportHktSimplifyFields } from "./DaeImportHktSimplifyFields";
import { DEFAULT_HKT_SIMPLIFY } from "../../utils/hktSimplifyUtils";
import type { ImportConfig } from "../../utils/sceneSessionService";

const scenePreviewHktCollisionPath = vi.fn();

vi.mock("../../utils/sceneSessionService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/sceneSessionService")>();
  return {
    ...actual,
    scenePreviewHktCollisionPath: (...args: unknown[]) => scenePreviewHktCollisionPath(...args),
    scenePreviewHktCollisionSession: vi.fn(),
  };
});

function buildImportConfig(
  overrides?: Partial<ImportConfig>,
): ImportConfig {
  return {
    loadToScene: false,
    convertToSsbh: true,
    generateHkt: true,
    hktSimplify: DEFAULT_HKT_SIMPLIFY,
    ssbhConfig: {
      baseFilename: "model",
      scaleFactor: 1,
      upAxis: "y_up",
      writeNumdlb: true,
      writeNumshb: true,
      writeNusktb: true,
      writeNumatb: true,
      writeJnttbl: false,
      writeMayaProfile: true,
      materialTemplate: null,
    },
    ...overrides,
  };
}

describe("DaeImportHktSimplifyFields", () => {
  beforeAll(() => {
    class ResizeObserverMock {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }

    globalThis.ResizeObserver = ResizeObserverMock;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    scenePreviewHktCollisionPath.mockResolvedValue({
      renderTriangleCount: 100,
      mergedTriangleCount: 80,
      simplifiedTriangleCount: 40,
      vertexCount: 50,
    });
  });

  it("does not re-run HKT preview when importConfig object identity changes only", async () => {
    const sourcePath = "C:/assets/mesh.dae";
    const onChange = vi.fn();
    const importConfig = buildImportConfig();

    const { rerender } = render(
      <DaeImportHktSimplifyFields
        value={DEFAULT_HKT_SIMPLIFY}
        onChange={onChange}
        importConfig={importConfig}
        sourcePath={sourcePath}
        sourceName="mesh.dae"
      />,
    );

    await waitFor(
      () => {
        expect(scenePreviewHktCollisionPath).toHaveBeenCalledTimes(1);
      },
      { timeout: 2000 },
    );

    rerender(
      <DaeImportHktSimplifyFields
        value={DEFAULT_HKT_SIMPLIFY}
        onChange={onChange}
        importConfig={buildImportConfig()}
        sourcePath={sourcePath}
        sourceName="mesh.dae"
      />,
    );

    await new Promise((resolve) => window.setTimeout(resolve, 500));
    expect(scenePreviewHktCollisionPath).toHaveBeenCalledTimes(1);
  });
});
