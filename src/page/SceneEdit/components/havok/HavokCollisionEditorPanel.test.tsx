import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { HavokMeshData } from "@/utils/havokXmlParser";
import { HavokCollisionEditorPanel } from "./HavokCollisionEditorPanel";
import { DEFAULT_HKT_SIMPLIFY } from "../../utils/hktSimplifyUtils";

const mockMeshData: HavokMeshData = {
  vertices: [
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 0],
    [0, 1, 0],
  ],
  quads: [[0, 1, 2, 3]],
  aabb: { min: [0, 0, 0], max: [1, 1, 0] },
  bodies: [],
};

vi.mock("@/utils/havokXmlParser", () => ({
  parseHavokXML: vi.fn(() => mockMeshData),
}));

vi.mock("../../utils/sceneSessionService", () => ({
  sceneConfigureImport: vi.fn().mockResolvedValue(undefined),
  sceneGenerateHkt: vi.fn().mockResolvedValue(true),
  sceneGetHavokMeta: vi.fn().mockResolvedValue({
    sourceId: "import-1",
    hktXml: "<hkpackfile/>",
  }),
  sceneGetImportConfig: vi.fn().mockResolvedValue({
    loadToScene: false,
    convertToSsbh: true,
    generateHkt: true,
    ssbhConfig: null,
    hktSimplify: {
      preset: "medium",
      enabled: true,
      planarityAngleDeg: 15,
      minTriangleArea: 1e-6,
      weldEpsilon: 0.001,
      targetTriangleRatio: null,
      maxTargetTriangles: null,
    },
  }),
  scenePreviewHktCollisionBytes: vi.fn(),
  scenePreviewHktCollisionSession: vi.fn().mockResolvedValue({
    renderTriangleCount: 4,
    mergedTriangleCount: 4,
    simplifiedTriangleCount: 2,
    vertexCount: 4,
  }),
}));

import { parseHavokXML } from "@/utils/havokXmlParser";
import {
  sceneConfigureImport,
  sceneGenerateHkt,
  sceneGetHavokMeta,
  scenePreviewHktCollisionSession,
} from "../../utils/sceneSessionService";

const defaultHktSimplify = { ...DEFAULT_HKT_SIMPLIFY };

describe("HavokCollisionEditorPanel", () => {
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
  });

  it("does not auto-run collision preview when the details panel mounts", async () => {
    render(
      <HavokCollisionEditorPanel
        sessionId="session-1"
        sessionImportId="import-1"
        sourcePath="E:/models/sample.dae"
        sourceName="sample_mesh"
        hktSimplify={defaultHktSimplify}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /regenerate hkt/i })).toBeInTheDocument();
    });

    expect(scenePreviewHktCollisionSession).not.toHaveBeenCalled();
    expect(sceneGenerateHkt).not.toHaveBeenCalled();
  });

  it("notifies parent with parsed collision mesh after Regenerate HKT", async () => {
    const user = userEvent.setup();
    const onHavokDataUpdated = vi.fn();

    render(
      <HavokCollisionEditorPanel
        sessionId="session-1"
        sessionImportId="import-1"
        sourceName="sample_mesh"
        hktSimplify={defaultHktSimplify}
        onHavokDataUpdated={onHavokDataUpdated}
      />,
    );

    await user.click(screen.getByRole("button", { name: /regenerate hkt/i }));

    await waitFor(() => {
      expect(sceneConfigureImport).toHaveBeenCalledWith(
        "session-1",
        "import-1",
        expect.objectContaining({ generateHkt: true }),
      );
      expect(sceneGenerateHkt).toHaveBeenCalledWith("session-1", "import-1", "auto");
      expect(sceneGetHavokMeta).toHaveBeenCalledWith("session-1", "import-1");
      expect(parseHavokXML).toHaveBeenCalledWith("<hkpackfile/>");
      expect(onHavokDataUpdated).toHaveBeenCalledWith("import-1", mockMeshData);
    });
  });
});
