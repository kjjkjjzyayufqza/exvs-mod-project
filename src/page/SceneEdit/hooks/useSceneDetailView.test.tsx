import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSceneDetailView } from "./useSceneDetailView";
import type { SsbhModelPreviewBundle } from "@/page/TestEditor/components/ssbh-model-preview/types";
import type { StageTreeNode } from "../components/StageHierarchyTree";

const mocks = vi.hoisted(() => ({
  ssbhTemplateReadNumatb: vi.fn(),
  ssbhReadNumdlbMapping: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/page/TestEditor/components/ssbh-model-preview/ssbhDaeIoService", () => ({
  ssbhReadNumdlbMapping: mocks.ssbhReadNumdlbMapping,
  ssbhWriteNumdlbMapping: vi.fn(),
  ssbhTemplateReadNumatb: mocks.ssbhTemplateReadNumatb,
  ssbhTemplateWriteNumatb: vi.fn(),
  ssbhReadNuhlpb: vi.fn(),
  ssbhWriteNuhlpb: vi.fn(),
}));

function matlProfile(materialLabel: string, textureRef: string) {
  return {
    major_version: 1,
    minor_version: 0,
    entries: [
      {
        material_label: materialLabel,
        shader_label: "SFX_PBS_0000000008800100_opaque",
        textures: [{ param_id: "Texture0", data: textureRef }],
        samplers: [],
        floats: [],
        booleans: [],
        vectors: [],
        colors: [],
        rasterizer_states: [],
        blend_states: [],
      },
    ],
  };
}

function makeMemoryBundle(): SsbhModelPreviewBundle {
  const nust = matlProfile("mat_nust", "nust_tex");
  const maya = matlProfile("mat_maya", "maya_tex");
  return {
    rootFolder: "memory://session-a/imported",
    modlPath: "memory://session-a/imported/0/imported.numdlb",
    meshPath: "memory://session-a/imported/0/imported.numshb",
    skelPath: "memory://session-a/imported/0/imported.nusktb",
    matlPaths: [
      "memory://session-a/imported/0/imported__nust__.numatb",
      "memory://session-a/imported/0/imported__maya__.numatb",
    ],
    modl: {
      model_name: "imported",
      skeleton_file_name: "imported.nusktb",
      material_file_names: ["imported__nust__.numatb", "imported__maya__.numatb"],
      mesh_file_name: "imported.numshb",
      animation_file_name: null,
      entries: [
        {
          mesh_object_name: "mesh_a",
          mesh_object_subindex: 0,
          material_label: "mat_nust",
        },
      ],
    },
    mesh: { objects: [] },
    skel: null,
    matl: {
      ...nust,
      entries: [...nust.entries, ...maya.entries],
    },
    matlProfiles: { maya, nust },
    textureRefs: ["nust_tex", "maya_tex"],
    resolvedNutexbPaths: [],
    textureResolve: [],
    warnings: [],
    sourceKind: "memory",
    sourceSessionId: "session-a",
    virtualModlPath: "memory://session-a/imported/0/imported.numdlb",
  };
}

describe("useSceneDetailView", () => {
  it("loads imported memory bundles from JSON without disk numdlb/numatb reads", async () => {
    const bundle = makeMemoryBundle();
    const node: StageTreeNode = {
      id: "dae-1",
      label: "Imported",
      role: "imported_dae",
    };

    const { result } = renderHook(() =>
      useSceneDetailView({
        baseModel: null,
        subModels: [],
        importedDaeObjects: [
          {
            id: "dae-1",
            name: "Imported",
            ssbhBundle: bundle,
          },
        ],
      }),
    );

    act(() => {
      result.current.openSession(node);
    });

    await waitFor(() => {
      expect(result.current.sessions[0]?.modelData?.numdlb.base?.modelName).toBe("imported");
    });
    expect(mocks.ssbhReadNumdlbMapping).not.toHaveBeenCalled();

    const sessionId = result.current.sessions[0]!.id;
    act(() => {
      result.current.setActiveTab(sessionId, "material");
    });

    await waitFor(() => {
      const material = result.current.sessions[0]?.modelData?.numatb.base;
      expect(material?.nustFile.entries[0]?.material_label).toBe("mat_nust");
      expect(material?.mayaFile.entries[0]?.material_label).toBe("mat_maya");
    });
    expect(mocks.ssbhTemplateReadNumatb).not.toHaveBeenCalled();
  });
});
