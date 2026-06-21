import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "sonner";
import { createEmptyNumatbFile } from "./daeSsbhTypes";
import {
  buildNumatbClipboardExportPayload,
  copyNumatbProfilesJsonToClipboard,
  parseNumatbProfilesJsonText,
} from "./copyNumatbProfilesJson";

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("copyNumatbProfilesJson", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("buildNumatbClipboardExportPayload normalizes both profiles", () => {
    const maya = createEmptyNumatbFile();
    const nust = createEmptyNumatbFile();

    const payload = buildNumatbClipboardExportPayload({
      modelName: "Test Model",
      mayaProfile: maya,
      nustProfile: nust,
      mirrorTexturePathsAcrossProfiles: true,
    });

    expect(payload.modelName).toBe("Test Model");
    expect(payload.mayaProfile).toEqual(maya);
    expect(payload.nustProfile).toEqual(nust);
    expect(payload.mirrorTexturePathsAcrossProfiles).toBe(true);
  });

  it("copyNumatbProfilesJsonToClipboard writes formatted JSON", async () => {
    const payload = buildNumatbClipboardExportPayload({
      mayaProfile: createEmptyNumatbFile(),
      nustProfile: createEmptyNumatbFile(),
    });

    const ok = await copyNumatbProfilesJsonToClipboard(payload);

    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith(JSON.stringify(payload, null, 2));
    expect(toast.success).toHaveBeenCalledWith("Copied NUMATB profiles JSON to clipboard");
  });

  it("copyNumatbProfilesJsonToClipboard reports clipboard failures", async () => {
    vi.mocked(writeText).mockRejectedValueOnce(new Error("denied"));

    const ok = await copyNumatbProfilesJsonToClipboard(
      buildNumatbClipboardExportPayload({
        mayaProfile: createEmptyNumatbFile(),
        nustProfile: createEmptyNumatbFile(),
      }),
    );

    expect(ok).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("Failed to copy NUMATB profiles to clipboard");
  });

  it("parseNumatbProfilesJsonText accepts mayaProfile and nustProfile bundle JSON", () => {
    const maya = createEmptyNumatbFile();
    const nust = createEmptyNumatbFile();
    maya.entries.push({
      material_label: "export_00_hull_color",
      shader_label: "",
      textures: [{ param_id: "DiffuseMap", data: "color_palette" }],
    });
    nust.entries.push({
      material_label: "export_00_hull_color",
      shader_label: "vstgStandard_VertexColor",
      textures: [{ param_id: "BaseColorMap", data: "color_palette" }],
      booleans: [{ param_id: "UseBaseColorMap", data: true }],
    });

    const payload = parseNumatbProfilesJsonText(
      JSON.stringify({
        modelName: "N1_rocket",
        mirrorTexturePathsAcrossProfiles: true,
        mayaProfile: maya,
        nustProfile: nust,
      }),
    );

    expect(payload.modelName).toBe("N1_rocket");
    expect(payload.mayaProfile.entries[0]?.material_label).toBe("export_00_hull_color");
    expect(payload.nustProfile.entries[0]?.textures?.[0]?.data).toBe("color_palette");
    expect(payload.mirrorTexturePathsAcrossProfiles).toBe(true);
  });
});
