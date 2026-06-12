import { describe, expect, it, vi } from "vitest";
import { createEmptyNumatbFile } from "@/components/ssbh-model-preview/daeSsbhTypes";

const { sceneValidateImportTextureRefs } = vi.hoisted(() => ({
  sceneValidateImportTextureRefs: vi.fn(),
}));

vi.mock("./sceneSessionService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./sceneSessionService")>();
  return {
    ...actual,
    sceneValidateImportTextureRefs,
  };
});

import { assertSsbhSessionTextureReferencesResolvable } from "./sceneDaeSessionImport";

describe("assertSsbhSessionTextureReferencesResolvable", () => {
  it("blocks conversion with profile, material, parameter, and value details", async () => {
    const nustFile = createEmptyNumatbFile();
    nustFile.entries.push({
      material_label: "rock",
      shader_label: "vstgStandard_VertexColor",
      textures: [],
      textures2: [
        { param_id: "BaseColorMap", data: "world_1_test-RGB" },
      ],
    });
    sceneValidateImportTextureRefs.mockResolvedValue({
      unresolvedReferences: ["world_1_test-RGB"],
    });

    await expect(
      assertSsbhSessionTextureReferencesResolvable({
        sessionState: {
          writeNumatb: true,
          writeMayaProfile: false,
          mayaFile: createEmptyNumatbFile(),
          nustFile,
        },
        sourcePath: "E:/models/rock.fbx",
        stageRoot: "E:/stage",
      }),
    ).rejects.toThrow(
      "Nust / rock / BaseColorMap: world_1_test-RGB",
    );
  });

  it("allows conversion when every declared reference resolves", async () => {
    const nustFile = createEmptyNumatbFile();
    nustFile.entries.push({
      material_label: "rock",
      shader_label: "vstgStandard_VertexColor",
      textures: [{ param_id: "BaseColorMap", data: "rock_color" }],
    });
    sceneValidateImportTextureRefs.mockResolvedValue({
      unresolvedReferences: [],
    });

    await expect(
      assertSsbhSessionTextureReferencesResolvable({
        sessionState: {
          writeNumatb: true,
          writeMayaProfile: false,
          mayaFile: createEmptyNumatbFile(),
          nustFile,
        },
        sourcePath: "E:/models/rock.fbx",
        stageRoot: "E:/stage",
      }),
    ).resolves.toBeUndefined();
  });
});
