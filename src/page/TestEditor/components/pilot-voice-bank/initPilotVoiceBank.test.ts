import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExtractType, Fhm2d_type_format } from "@/models/fhm2d";
import { initPilotVoiceBank, planPilotVoiceBankInit } from "./initPilotVoiceBank";

const { extractMock } = vi.hoisted(() => ({
  extractMock: vi.fn(),
}));

vi.mock("@/models/fhm2d", () => ({
  ExtractFHMData: extractMock,
  ExtractType: { SingleFolder: "single-folder" },
  Fhm2d_type_format: { fhm2d_sound: "fhm2d_sound" },
}));

describe("planPilotVoiceBankInit", () => {
  beforeEach(() => {
    extractMock.mockReset();
  });

  it("builds the dplcache pack path and the per-stem workspace folder", () => {
    const plan = planPilotVoiceBankInit({
      dplCacheDir: "E:/dplcache",
      workspaceRoot: "E:/workspace",
      stem: "VO_0001_P01_0",
      bankPackage: 0x87d4809b,
    });
    expect(plan.sourceFhm2dPath).toBe("E:/dplcache\\0x87D4809B.fhm2d");
    expect(plan.workspaceFolder).toBe("E:/workspace/091waveform/voice/pilot/VO_0001_P01_0");
  });

  it("throws when bankPackage is 0 before any extract call", async () => {
    await expect(
      initPilotVoiceBank({
        dplCacheDir: "E:/dplcache",
        workspaceRoot: "E:/workspace",
        stem: "VO_0001_P01_0",
        bankPackage: 0,
      }),
    ).rejects.toThrow(/bankPackage is 0/);
    expect(extractMock).not.toHaveBeenCalled();
  });

  it("extracts with the sound pack type", async () => {
    extractMock.mockResolvedValue({});
    await initPilotVoiceBank({
      dplCacheDir: "E:/dplcache",
      workspaceRoot: "E:/workspace",
      stem: "VO_0001_P01_0",
      bankPackage: 0x87d4809b,
    });
    expect(extractMock).toHaveBeenCalledWith(
      "E:/dplcache\\0x87D4809B.fhm2d",
      "E:/workspace/091waveform/voice/pilot/VO_0001_P01_0",
      ExtractType.SingleFolder,
      Fhm2d_type_format.fhm2d_sound,
    );
  });
});
