import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "sonner";

import {
  buildShlClipboardExportPayload,
  copyShlJsonToClipboard,
} from "./copyShlJson";
import type { ShlFileData } from "./shlIoService";

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function sampleDraft(): ShlFileData {
  return {
    version: 100,
    reserved08: 0,
    records: [
      {
        modelId: 0x214c0554,
        modelType: 1,
        folderIndex: 7,
        unk1: 2,
        slotIndex: 7,
      },
    ],
    trailingData: [],
  };
}

describe("copyShlJson", () => {
  beforeEach(() => {
    vi.mocked(writeText).mockReset();
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it("annotates records with LE hex and folder names from structure order", () => {
    const names = Array.from({ length: 8 }, (_, i) => `model_${i}`);
    names[7] = "015gndmuc_004deltpl_001_wep_handl_ngr00";
    const payload = buildShlClipboardExportPayload({
      filePath: "E:\\\\pkg\\\\shell.shl",
      draft: sampleDraft(),
      base: sampleDraft(),
      modelFolderNames: names,
    });

    expect(payload.kind).toBe("shl");
    expect(payload.dirty).toBe(false);
    expect(payload.recordsAnnotated[0]).toMatchObject({
      index: 0,
      modelIdLeHex: "54054C21",
      modelTypeLabel: "Type 1",
      folderName: "015gndmuc_004deltpl_001_wep_handl_ngr00",
      folderIndex: 7,
    });
  });

  it("marks dirty when draft diverges from base", () => {
    const draft = sampleDraft();
    const base = sampleDraft();
    draft.records[0] = { ...draft.records[0], unk1: 9 };
    const payload = buildShlClipboardExportPayload({
      filePath: "shell.shl",
      draft,
      base,
      modelFolderNames: [],
    });
    expect(payload.dirty).toBe(true);
    expect(payload.base?.records[0].unk1).toBe(2);
    expect(payload.draft.records[0].unk1).toBe(9);
  });

  it("copyShlJsonToClipboard writes pretty JSON", async () => {
    const payload = buildShlClipboardExportPayload({
      filePath: "shell.shl",
      draft: sampleDraft(),
    });
    const ok = await copyShlJsonToClipboard(payload);
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith(JSON.stringify(payload, null, 2));
    expect(toast.success).toHaveBeenCalledWith("Copied SHL JSON to clipboard");
  });

  it("reports clipboard failures", async () => {
    vi.mocked(writeText).mockRejectedValueOnce(new Error("denied"));
    const ok = await copyShlJsonToClipboard(
      buildShlClipboardExportPayload({ filePath: "shell.shl", draft: sampleDraft() }),
    );
    expect(ok).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("Failed to copy SHL JSON to clipboard");
  });
});
