import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDaeSsbhSessionStore } from "@/components/ssbh-model-preview/store/daeSsbhSessionStore";
import { DaeImportSsbhFullPanel } from "./DaeImportSsbhFullPanel";
import type { DaeAnalysisResult } from "./daeImportTypes";

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/components/ssbh-model-preview/components/NumdlbMaterialMappingEditor", () => ({
  NumdlbMaterialMappingEditor: () => <div data-testid="numdlb-mapping-editor" />,
}));

vi.mock("@/components/ssbh-model-preview/components/NumatbTemplateEditor", () => ({
  NumatbTemplateEditor: () => <div data-testid="numatb-template-editor" />,
}));

vi.mock("@/components/ssbh-model-preview/components/MissingTexturePathFillPanel", () => ({
  MissingTexturePathFillPanel: () => null,
}));

vi.mock("@/components/ssbh-model-preview/hooks/useStableMissingTextureFillSlots", () => ({
  useStableMissingTextureFillSlots: () => [],
}));

vi.mock(
  "@/components/ssbh-model-preview/store/numatbTemplateStoreHelpers",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/components/ssbh-model-preview/store/numatbTemplateStoreHelpers")
      >();
    return {
      ...actual,
      applyTexturePathFillToProfiles: vi.fn(),
      collectMissingTexturePathSlotRefsForExportSession: () => [],
    };
  },
);

const analysis: DaeAnalysisResult = {
  daePath: "E:\\test\\mesh.dae",
  upAxis: "Y_UP",
  meshRows: [
    {
      name: "mesh_a",
      vertexCount: 12,
      indexCount: 18,
      triangleCount: 6,
      normalCount: 12,
      uvCount: 12,
      normalsMatchVertices: true,
      uvsMatchVertices: true,
      boneInfluenceGroups: 0,
      maxInfluencesPerVertex: 0,
      exceedsFourInfluences: false,
    },
  ],
  boneCount: 0,
  boneNames: [],
  geometryNames: ["mesh_a"],
  blockingErrors: [],
  warnings: [],
  canConvert: true,
};

describe("DaeImportSsbhFullPanel", () => {
  beforeEach(() => {
    useDaeSsbhSessionStore.getState().resetSession();
    useDaeSsbhSessionStore.setState({
      loadTemplateLibrary: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("renders a flip UV toggle that updates the session store", () => {
    render(
      <DaeImportSsbhFullPanel
        analysis={analysis}
        sourcePath={analysis.daePath}
        stageRoot={null}
      />,
    );

    const flipUvCheckbox = screen.getByRole("checkbox", { name: /flip uv/i });
    expect(useDaeSsbhSessionStore.getState().flipUv).toBe(false);

    fireEvent.click(flipUvCheckbox);

    expect(useDaeSsbhSessionStore.getState().flipUv).toBe(true);
  });

  it("applies Blender FBX unit-model defaults in unit model mode", async () => {
    render(
      <DaeImportSsbhFullPanel
        analysis={analysis}
        sourcePath="E:\\unit\\body.fbx"
        stageRoot="E:\\unit\\0"
        directToDisk
        unitModelMode
      />,
    );

    await waitFor(() => {
      const state = useDaeSsbhSessionStore.getState();
      expect(state.importKind).toBe("fbx");
      expect(state.scaleFactorText).toBe("1");
      expect(state.flipUv).toBe(true);
    });
  });

  it("keeps generic defaults for unit model DAE imports", async () => {
    render(
      <DaeImportSsbhFullPanel
        analysis={analysis}
        sourcePath={analysis.daePath}
        stageRoot="E:\\unit\\0"
        directToDisk
        unitModelMode
      />,
    );

    await waitFor(() => {
      const state = useDaeSsbhSessionStore.getState();
      expect(state.scaleFactorText).toBe("1");
      expect(state.flipUv).toBe(false);
    });
  });

  it("locks every required Unit model output on", async () => {
    useDaeSsbhSessionStore.setState({
      writeNumdlb: false,
      writeNumshb: false,
      writeNusktb: false,
      writeNumatb: false,
      writeMayaProfile: false,
    });

    render(
      <DaeImportSsbhFullPanel
        analysis={analysis}
        sourcePath={analysis.daePath}
        stageRoot="E:\\unit\\0"
        directToDisk
        unitModelMode
      />,
    );

    await waitFor(() => {
      const state = useDaeSsbhSessionStore.getState();
      expect(state.writeNumdlb).toBe(true);
      expect(state.writeNumshb).toBe(true);
      expect(state.writeNusktb).toBe(true);
      expect(state.writeNumatb).toBe(true);
      expect(state.writeMayaProfile).toBe(true);
    });

    for (const name of [
      ".numdlb",
      ".numshb",
      ".nusktb",
      "__nust__.numatb",
      "__maya__.numatb",
      ".jnttbl",
    ]) {
      expect(screen.getByRole("checkbox", { name })).toBeDisabled();
    }
  });
});
