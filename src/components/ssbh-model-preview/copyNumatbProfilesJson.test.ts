import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "sonner";
import { createEmptyNumatbFile } from "./daeSsbhTypes";
import {
  buildNumatbClipboardExportPayload,
  copyNumatbProfilesJsonToClipboard,
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
});
