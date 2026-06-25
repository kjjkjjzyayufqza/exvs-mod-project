import { describe, expect, it, vi } from "vitest";
import type { TypedParamFile } from "../components/param-editor/typedParamTypes";
import { obfEncodeFromUtf8String } from "@/utils/obfString";
import {
  buildParamLabelIndex,
  loadBestEffortParamLabels,
  loadParamLabelIndex,
  readObfLabelAtOffset,
} from "./mscParamLabelResolver";

const { invokeMock, ioReadFileMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  ioReadFileMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@/IO/fileSystem", () => ({
  IOReadFile: ioReadFileMock,
}));

describe("readObfLabelAtOffset", () => {
  it("decodes obfuscated null-terminated string from pointed record start", () => {
    const bytes = new Uint8Array(0x80);
    bytes.set(obfEncodeFromUtf8String("GUN_TEST"), 0x20);
    expect(readObfLabelAtOffset(bytes, 0x20)).toBe("GUN_TEST");
  });
});

describe("buildParamLabelIndex", () => {
  it("maps entry ids to action/resource labels when offsets exist", () => {
    const bytes = new Uint8Array(0x100);
    bytes.set(obfEncodeFromUtf8String("ACTION_DELTA"), 0x20);
    bytes.set(obfEncodeFromUtf8String("RESOURCE_DELTA"), 0x40);

    const parsed: TypedParamFile = {
      header: {},
      fieldSpecs: [],
      entryIds: [0xa8e202bf],
      entries: [
        {
          entryId: 0xa8e202bf,
          actionLabelOffset: 0x20,
          resourceLabelOffset: 0x40,
        },
      ],
      trailingData: [],
    };

    const labels = buildParamLabelIndex(parsed, bytes);
    expect(labels.get("0xa8e202bf")).toEqual({
      actionLabel: "ACTION_DELTA",
      resourceLabel: "RESOURCE_DELTA",
    });
  });
});

describe("loadParamLabelIndex", () => {
  it("loads parsed entries and raw bytes through existing front-end APIs", async () => {
    const bytes = new Uint8Array(0x80);
    bytes.set(obfEncodeFromUtf8String("RESOURCE_ONLY"), 0x20);

    invokeMock.mockResolvedValueOnce({
      header: {},
      fieldSpecs: [],
      entryIds: [0xa8e202bf],
      entries: [
        {
          entryId: 0xa8e202bf,
          actionLabelOffset: 0,
          resourceLabelOffset: 0x20,
        },
      ],
      trailingData: [],
    } satisfies TypedParamFile);
    ioReadFileMock.mockResolvedValueOnce(bytes.buffer.slice(0));

    const labels = await loadParamLabelIndex("E:/params/armsparam.bin", "armsparam");
    expect(labels.get("0xa8e202bf")).toEqual({
      actionLabel: null,
      resourceLabel: "RESOURCE_ONLY",
    });
  });
});

describe("loadBestEffortParamLabels", () => {
  it("merges candidates and skips failing files", async () => {
    const firstBytes = new Uint8Array(0x80);
    firstBytes.set(obfEncodeFromUtf8String("ACTION_ONE"), 0x10);
    const secondBytes = new Uint8Array(0x80);
    secondBytes.set(obfEncodeFromUtf8String("RESOURCE_TWO"), 0x20);

    invokeMock
      .mockResolvedValueOnce({
        header: {},
        fieldSpecs: [],
        entryIds: [0x11111111],
        entries: [{ entryId: 0x11111111, actionLabelOffset: 0x10, resourceLabelOffset: 0 }],
        trailingData: [],
      } satisfies TypedParamFile)
      .mockRejectedValueOnce(new Error("bad file"))
      .mockResolvedValueOnce({
        header: {},
        fieldSpecs: [],
        entryIds: [0x11111111],
        entries: [{ entryId: 0x11111111, actionLabelOffset: 0, resourceLabelOffset: 0x20 }],
        trailingData: [],
      } satisfies TypedParamFile);

    ioReadFileMock
      .mockResolvedValueOnce(firstBytes.buffer.slice(0))
      .mockResolvedValueOnce(secondBytes.buffer.slice(0));

    const labels = await loadBestEffortParamLabels([
      { path: "E:/params/armsparam.bin", paramType: "armsparam" },
      { path: "E:/params/missing.bin", paramType: "characterparam" },
      { path: "E:/params/characterparam.bin", paramType: "characterparam" },
    ]);

    expect(labels.get("0x11111111")).toEqual({
      actionLabel: "ACTION_ONE",
      resourceLabel: "RESOURCE_TWO",
    });
  });
});
