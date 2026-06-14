import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ssbhEditorKindForPath, useSsbhFileEditorSessions } from "./useSsbhFileEditorSessions";

const mocks = vi.hoisted(() => ({
  readNumatb: vi.fn(),
  writeNumatb: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("./ssbhDaeIoService", () => ({
  ssbhReadNumdlbMapping: vi.fn(),
  ssbhWriteNumdlbMapping: vi.fn(),
  ssbhReadNuhlpb: vi.fn(),
  ssbhWriteNuhlpb: vi.fn(),
  ssbhTemplateReadNumatb: mocks.readNumatb,
  ssbhTemplateWriteNumatb: mocks.writeNumatb,
}));

function matlProfile(materialLabel: string) {
  return {
    major_version: 1,
    minor_version: 6,
    entries: [
      {
        material_label: materialLabel,
        shader_label: "SFX_PBS_0000000008800100_opaque",
        textures: [],
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

function normalizedPath(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}

beforeEach(() => {
  mocks.readNumatb.mockReset();
  mocks.writeNumatb.mockReset();
});

describe("ssbhEditorKindForPath", () => {
  it("dispatches by extension", () => {
    expect(ssbhEditorKindForPath("a/b.numdlb")).toBe("numdlb");
    expect(ssbhEditorKindForPath("a/b.numatb")).toBe("numatb");
    expect(ssbhEditorKindForPath("a/b.nuhlpb")).toBe("nuhlpb");
    expect(ssbhEditorKindForPath("a/b.jnttbl")).toBe("jnttbl");
  });

  it("is case-insensitive", () => {
    expect(ssbhEditorKindForPath("A\\B.NUMATB")).toBe("numatb");
  });

  it("returns null for unsupported files", () => {
    expect(ssbhEditorKindForPath("a/b.nutexb")).toBeNull();
    expect(ssbhEditorKindForPath("a/b.bin")).toBeNull();
    expect(ssbhEditorKindForPath("")).toBeNull();
  });
});

describe("useSsbhFileEditorSessions NUMATB profiles", () => {
  it("loads both maya and nust files into the same editor session", async () => {
    mocks.readNumatb.mockImplementation(async (path: string) =>
      normalizedPath(path).includes("__maya__") ? matlProfile("maya_material") : matlProfile("nust_material"),
    );
    const { result } = renderHook(() => useSsbhFileEditorSessions());

    act(() => {
      result.current.openNumatb("E:\\unit\\body__maya__.numatb");
    });

    await waitFor(() => {
      expect(result.current.hostProps.numatb.sessions[0]?.loading).toBe(false);
    });

    const bundle = result.current.hostProps.numatb.sessions[0]?.draftData;
    expect(bundle?.mayaFile.entries[0]?.material_label).toBe("maya_material");
    expect(bundle?.nustFile.entries[0]?.material_label).toBe("nust_material");
    expect(mocks.readNumatb).toHaveBeenCalledTimes(2);
  });

  it("falls back from an m001 nust path to the base maya profile", async () => {
    mocks.readNumatb.mockImplementation(async (path: string) => {
      const normalized = normalizedPath(path);
      if (normalized.endsWith("body_m001__nust__.numatb")) {
        return matlProfile("nust_m001_material");
      }
      if (normalized.endsWith("body__maya__.numatb")) {
        return matlProfile("maya_material");
      }
      throw new Error(`Missing fixture: ${path}`);
    });
    const { result } = renderHook(() => useSsbhFileEditorSessions());

    act(() => {
      result.current.openNumatb("E:\\unit\\body_m001__nust__.numatb");
    });

    await waitFor(() => {
      expect(result.current.hostProps.numatb.sessions[0]?.loading).toBe(false);
    });

    const bundle = result.current.hostProps.numatb.sessions[0]?.draftData;
    expect(bundle?.mayaFile.entries[0]?.material_label).toBe("maya_material");
    expect(bundle?.nustFile.entries[0]?.material_label).toBe("nust_m001_material");
  });

  it("writes both loaded profiles when the shared NUMATB bundle is saved", async () => {
    mocks.readNumatb.mockImplementation(async (path: string) =>
      normalizedPath(path).includes("__maya__") ? matlProfile("maya_material") : matlProfile("nust_material"),
    );
    mocks.writeNumatb.mockResolvedValue(undefined);
    const { result } = renderHook(() => useSsbhFileEditorSessions());

    act(() => {
      result.current.openNumatb("E:\\unit\\body__maya__.numatb");
    });
    await waitFor(() => {
      expect(result.current.hostProps.numatb.sessions[0]?.loading).toBe(false);
    });

    const session = result.current.hostProps.numatb.sessions[0]!;
    act(() => {
      result.current.hostProps.numatb.onDraftChange(session.id, {
        mayaFile: matlProfile("edited_maya"),
        nustFile: matlProfile("edited_nust"),
        mirrorTexturePathsAcrossProfiles: true,
      });
    });
    await act(async () => {
      await result.current.hostProps.numatb.onSave(session.id);
    });

    const writtenPaths = mocks.writeNumatb.mock.calls.map(([path]) => normalizedPath(path));
    expect(writtenPaths).toEqual(
      expect.arrayContaining([
        "e:/unit/body__maya__.numatb",
        "e:/unit/body__nust__.numatb",
      ]),
    );
    expect(mocks.writeNumatb).toHaveBeenCalledTimes(2);
  });
});
