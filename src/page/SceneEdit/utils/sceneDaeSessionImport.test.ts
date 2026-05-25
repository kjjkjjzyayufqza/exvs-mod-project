import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-fs", () => ({
  readFile: vi.fn(),
}));

vi.mock("./sceneSessionService", () => ({
  sceneImportDae: vi.fn(),
  sceneConfigureImport: vi.fn(),
  sceneExecuteImport: vi.fn(),
}));

import { readFile } from "@tauri-apps/plugin-fs";
import { createDefaultDaeImportConfig } from "../components/dae-import/daeImportDefaults";
import {
  buildSsbhSessionImportConfig,
  ensureImportedDaeSessionImport,
  importDaeThroughSceneSession,
  retargetSessionImportFolderName,
} from "./sceneDaeSessionImport";
import {
  sceneConfigureImport,
  sceneExecuteImport,
  sceneImportDae,
  type ImportConfig,
} from "./sceneSessionService";

const mockReadFile = vi.mocked(readFile);
const mockSceneImportDae = vi.mocked(sceneImportDae);
const mockSceneConfigureImport = vi.mocked(sceneConfigureImport);
const mockSceneExecuteImport = vi.mocked(sceneExecuteImport);

describe("buildSsbhSessionImportConfig", () => {
  it("maps session store settings into a memory-session import config", () => {
    const daeConfig = createDefaultDaeImportConfig("sample_mesh");
    daeConfig.generateHkt = true;

    const importConfig = buildSsbhSessionImportConfig(
      daeConfig,
      {
        outputBaseName: "sample_mesh",
        scaleFactorText: "2",
        upAxis: "z_up",
        writeNumdlb: true,
        writeNumshb: true,
        writeNusktb: false,
        writeNumatb: true,
        writeMayaProfile: false,
      },
      "sample_mesh",
    );

    expect(importConfig.loadToScene).toBe(false);
    expect(importConfig.convertToSsbh).toBe(true);
    expect(importConfig.generateHkt).toBe(true);
    expect(importConfig.hktSimplify.enabled).toBe(true);
    expect(importConfig.ssbhConfig).toEqual({
      baseFilename: "sample_mesh",
      scaleFactor: 2,
      upAxis: "z_up",
      writeNumdlb: true,
      writeNumshb: true,
      writeNusktb: false,
      writeNumatb: true,
      writeJnttbl: true,
      writeMayaProfile: false,
      materialTemplate: "default",
    });
  });

  it("falls back to scale factor 1 when scale text is invalid", () => {
    const daeConfig = createDefaultDaeImportConfig("sample_mesh");
    const importConfig = buildSsbhSessionImportConfig(
      daeConfig,
      {
        outputBaseName: "sample_mesh",
        scaleFactorText: "not-a-number",
        upAxis: "y_up",
        writeNumdlb: true,
        writeNumshb: true,
        writeNusktb: true,
        writeNumatb: true,
        writeMayaProfile: false,
      },
      "sample_mesh",
    );

    expect(importConfig.ssbhConfig?.scaleFactor).toBe(1);
  });
});

describe("importDaeThroughSceneSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFile.mockResolvedValue(new Uint8Array([60, 67, 79, 76]));
    mockSceneImportDae.mockResolvedValue("import-1");
    mockSceneConfigureImport.mockResolvedValue(undefined);
    mockSceneExecuteImport.mockResolvedValue({
      importId: "import-1",
      name: "sample_mesh",
      ssbhGenerated: true,
      hktGenerated: false,
      hktDetail: null,
      warnings: [],
    });
  });

  it("reads DAE bytes and runs the scene session import pipeline", async () => {
    const importConfig: ImportConfig = {
      loadToScene: false,
      convertToSsbh: true,
      generateHkt: false,
      hktSimplify: {
        enabled: true,
        planarityAngleDeg: 8,
        minTriangleArea: 1e-8,
        weldEpsilon: 1e-5,
      },
      ssbhConfig: {
        baseFilename: "sample_mesh",
        scaleFactor: 1,
        upAxis: "y_up",
        writeNumdlb: true,
        writeNumshb: true,
        writeNusktb: true,
        writeNumatb: true,
        writeJnttbl: true,
        writeMayaProfile: false,
        materialTemplate: null,
      },
    };

    const result = await importDaeThroughSceneSession({
      sessionId: "session-1",
      filePath: "E:/models/sample.dae",
      name: "sample_mesh",
      importConfig,
    });

    expect(mockReadFile).toHaveBeenCalledWith("E:/models/sample.dae");
    expect(mockSceneImportDae).toHaveBeenCalledWith(
      "session-1",
      [60, 67, 79, 76],
      "sample_mesh",
    );
    expect(mockSceneConfigureImport).toHaveBeenCalledWith(
      "session-1",
      "import-1",
      importConfig,
    );
    expect(mockSceneExecuteImport).toHaveBeenCalledWith("session-1", "import-1");
    expect(result.ssbhGenerated).toBe(true);
  });
});

describe("retargetSessionImportFolderName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSceneConfigureImport.mockResolvedValue(undefined);
  });

  it("updates the session import base filename before save", async () => {
    const importConfig: ImportConfig = {
      loadToScene: true,
      convertToSsbh: true,
      generateHkt: false,
      hktSimplify: {
        enabled: true,
        planarityAngleDeg: 8,
        minTriangleArea: 1e-8,
        weldEpsilon: 1e-5,
      },
      ssbhConfig: {
        baseFilename: "old_name",
        scaleFactor: 1,
        upAxis: "y_up",
        writeNumdlb: true,
        writeNumshb: true,
        writeNusktb: true,
        writeNumatb: true,
        writeJnttbl: true,
        writeMayaProfile: false,
        materialTemplate: null,
      },
    };

    await retargetSessionImportFolderName(
      "session-1",
      "import-1",
      importConfig,
      "sample_mesh",
    );

    expect(mockSceneConfigureImport).toHaveBeenCalledWith("session-1", "import-1", {
      ...importConfig,
      ssbhConfig: {
        ...importConfig.ssbhConfig!,
        baseFilename: "sample_mesh",
      },
    });
  });

  it("throws when the import config has no SSBH section", async () => {
    await expect(
      retargetSessionImportFolderName(
        "session-1",
        "import-1",
        { loadToScene: true, convertToSsbh: false, generateHkt: false, ssbhConfig: null, hktSimplify: { enabled: true, planarityAngleDeg: 8, minTriangleArea: 1e-8, weldEpsilon: 1e-5 } },
        "sample_mesh",
      ),
    ).rejects.toThrow("Session import is missing SSBH configuration");
  });
});

describe("ensureImportedDaeSessionImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFile.mockResolvedValue(new Uint8Array([60, 67, 79, 76]));
    mockSceneImportDae.mockResolvedValue("import-lazy");
    mockSceneConfigureImport.mockResolvedValue(undefined);
    mockSceneExecuteImport.mockResolvedValue({
      importId: "import-lazy",
      name: "sample_mesh",
      ssbhGenerated: false,
      hktGenerated: false,
      hktDetail: null,
      warnings: [],
    });
  });

  it("returns an existing session import id without re-importing", async () => {
    const importId = await ensureImportedDaeSessionImport({
      sessionId: "session-1",
      object: {
        sessionImportId: "import-existing",
        sourcePath: "E:/models/sample.dae",
        name: "sample_mesh",
      },
    });

    expect(importId).toBe("import-existing");
    expect(mockReadFile).not.toHaveBeenCalled();
    expect(mockSceneImportDae).not.toHaveBeenCalled();
  });

  it("registers preview-only DAE objects in the session before HKT generation", async () => {
    const importId = await ensureImportedDaeSessionImport({
      sessionId: "session-1",
      object: {
        sourcePath: "E:/models/sample.dae",
        name: "sample_mesh",
      },
    });

    expect(importId).toBe("import-lazy");
    expect(mockSceneImportDae).toHaveBeenCalledWith(
      "session-1",
      [60, 67, 79, 76],
      "sample_mesh",
    );
    expect(mockSceneConfigureImport).toHaveBeenCalledWith(
      "session-1",
      "import-lazy",
      expect.objectContaining({ convertToSsbh: false, generateHkt: false }),
    );
  });
});
