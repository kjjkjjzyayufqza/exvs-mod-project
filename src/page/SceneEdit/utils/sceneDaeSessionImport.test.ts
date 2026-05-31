import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./sceneSessionService", () => ({
  sceneImportDaeFromPath: vi.fn(),
  sceneConfigureImport: vi.fn(),
  sceneExecuteImport: vi.fn(),
  sceneGetImportConfig: vi.fn(),
}));

import { createDefaultDaeImportConfig } from "../components/dae-import/daeImportDefaults";
import { DEFAULT_HKT_SIMPLIFY } from "./hktSimplifyUtils";
import { createEmptyNumatbFile } from "@/components/ssbh-model-preview/daeSsbhTypes";
import { createImportedDaeMaterialProfile } from "./sceneDaeSsbhSave";
import {
  buildSsbhSessionImportConfig,
  ensureImportedDaeSessionImport,
  importDaeThroughSceneSession,
  resolveSessionImportConfigForSave,
  retargetAndReconvertSessionImport,
  retargetSessionImportFolderName,
} from "./sceneDaeSessionImport";
import {
  sceneConfigureImport,
  sceneExecuteImport,
  sceneGetImportConfig,
  sceneImportDaeFromPath,
  type ImportConfig,
} from "./sceneSessionService";

const mockSceneImportDaeFromPath = vi.mocked(sceneImportDaeFromPath);
const mockSceneConfigureImport = vi.mocked(sceneConfigureImport);
const mockSceneExecuteImport = vi.mocked(sceneExecuteImport);
const mockSceneGetImportConfig = vi.mocked(sceneGetImportConfig);

describe("buildSsbhSessionImportConfig", () => {
  it("maps session store settings into a memory-session import config", () => {
    const daeConfig = createDefaultDaeImportConfig("sample_mesh");
    daeConfig.generateHkt = true;

    const materialProfile = createImportedDaeMaterialProfile();
    const numdlbEntries = [
      {
        meshObjectName: "body_geo",
        meshObjectSubindex: 0,
        materialLabel: "pbr1Mtl",
      },
    ];

    const importConfig = buildSsbhSessionImportConfig(
      daeConfig,
      {
        outputBaseName: "sample_mesh",
        scaleFactorText: "2",
        upAxis: "z_up",
        flipUv: true,
        writeNumdlb: true,
        writeNumshb: true,
        writeNusktb: false,
        writeNumatb: true,
        writeMayaProfile: true,
        mayaFile: materialProfile,
        nustFile: materialProfile,
        numdlbEntries,
      } as Parameters<typeof buildSsbhSessionImportConfig>[1] & { flipUv: boolean },
      "sample_mesh",
    );

    expect(importConfig.loadToScene).toBe(false);
    expect(importConfig.convertToSsbh).toBe(true);
    expect(importConfig.generateHkt).toBe(true);
    expect(importConfig.hktSimplify.enabled).toBe(true);
    expect(importConfig.hktSimplify.preset).toBe("medium");
    expect(importConfig.ssbhConfig).toEqual({
      baseFilename: "sample_mesh",
      scaleFactor: 2,
      upAxis: "z_up",
      flipUv: true,
      writeNumdlb: true,
      writeNumshb: true,
      writeNusktb: false,
      writeNumatb: true,
      writeJnttbl: true,
      writeMayaProfile: true,
      materialTemplate: "default",
      mayaFile: materialProfile,
      nustFile: materialProfile,
      numdlbEntries,
    });
  });

  it("includes numdlb mesh material mappings in session import config", () => {
    const daeConfig = createDefaultDaeImportConfig("sample_mesh");
    const numdlbEntries = [
      { meshObjectName: "mesh_a", meshObjectSubindex: 0, materialLabel: "pbr1Mtl" },
      { meshObjectName: "mesh_b", meshObjectSubindex: 0, materialLabel: "pbr2Mtl" },
    ];

    const importConfig = buildSsbhSessionImportConfig(
      daeConfig,
      {
        outputBaseName: "sample_mesh",
        scaleFactorText: "1",
        upAxis: "y_up",
        writeNumdlb: true,
        writeNumshb: true,
        writeNusktb: true,
        writeNumatb: true,
        writeMayaProfile: false,
        mayaFile: createEmptyNumatbFile(),
        nustFile: createEmptyNumatbFile(),
        numdlbEntries,
      },
      "sample_mesh",
    );

    expect(importConfig.ssbhConfig?.numdlbEntries).toEqual(numdlbEntries);
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
        mayaFile: createEmptyNumatbFile(),
        nustFile: createEmptyNumatbFile(),
        numdlbEntries: [],
      },
      "sample_mesh",
    );

    expect(importConfig.ssbhConfig?.scaleFactor).toBe(1);
  });
});

describe("resolveSessionImportConfigForSave", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves existing material profiles and disables loadToScene", async () => {
    const materialProfile = createImportedDaeMaterialProfile();
    mockSceneGetImportConfig.mockResolvedValue({
      loadToScene: true,
      convertToSsbh: true,
      generateHkt: true,
      hktSimplify: { ...DEFAULT_HKT_SIMPLIFY },
      ssbhConfig: {
        baseFilename: "modelsss",
        scaleFactor: 2,
        upAxis: "z_up",
        writeNumdlb: true,
        writeNumshb: true,
        writeNusktb: true,
        writeNumatb: true,
        writeJnttbl: true,
        writeMayaProfile: true,
        materialTemplate: "default",
        mayaFile: materialProfile,
        nustFile: materialProfile,
        numdlbEntries: [
          {
            meshObjectName: "body_geo",
            meshObjectSubindex: 0,
            materialLabel: "pbr1Mtl",
          },
        ],
      },
    });

    const importConfig = await resolveSessionImportConfigForSave(
      "session-1",
      "import-1",
      "sssssccccc",
    );

    expect(mockSceneGetImportConfig).toHaveBeenCalledWith("session-1", "import-1");
    expect(importConfig.loadToScene).toBe(false);
    expect(importConfig.convertToSsbh).toBe(true);
    expect(importConfig.generateHkt).toBe(false);
    expect(importConfig.ssbhConfig?.baseFilename).toBe("sssssccccc");
    expect(importConfig.ssbhConfig?.mayaFile).toEqual(materialProfile);
    expect(importConfig.ssbhConfig?.nustFile).toEqual(materialProfile);
    expect(importConfig.ssbhConfig?.numdlbEntries).toEqual([
      {
        meshObjectName: "body_geo",
        meshObjectSubindex: 0,
        materialLabel: "pbr1Mtl",
      },
    ]);
    expect(importConfig.ssbhConfig?.scaleFactor).toBe(2);
  });

  it("throws when the session import has no SSBH config", async () => {
    mockSceneGetImportConfig.mockResolvedValue({
      loadToScene: true,
      convertToSsbh: false,
      generateHkt: false,
      hktSimplify: { ...DEFAULT_HKT_SIMPLIFY },
      ssbhConfig: null,
    });

    await expect(
      resolveSessionImportConfigForSave("session-1", "import-1", "sssssccccc"),
    ).rejects.toThrow("Session import is missing SSBH configuration");
  });
});

describe("importDaeThroughSceneSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSceneImportDaeFromPath.mockResolvedValue("import-1");
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

  it("runs the scene session import pipeline from a DAE path", async () => {
    const importConfig: ImportConfig = {
      loadToScene: false,
      convertToSsbh: true,
      generateHkt: false,
      hktSimplify: { ...DEFAULT_HKT_SIMPLIFY },
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

    expect(mockSceneImportDaeFromPath).toHaveBeenCalledWith(
      "session-1",
      "E:/models/sample.dae",
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

describe("retargetAndReconvertSessionImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("retargets base filename and re-converts SSBH artifacts for save", async () => {
    const importConfig: ImportConfig = {
      loadToScene: true,
      convertToSsbh: true,
      generateHkt: false,
      hktSimplify: { ...DEFAULT_HKT_SIMPLIFY },
      ssbhConfig: {
        baseFilename: "modelsss",
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

    await retargetAndReconvertSessionImport(
      "session-1",
      "import-1",
      importConfig,
      "zzzz_import_modelsss",
    );

    expect(mockSceneConfigureImport).toHaveBeenCalledWith("session-1", "import-1", {
      ...importConfig,
      ssbhConfig: {
        ...importConfig.ssbhConfig!,
        baseFilename: "zzzz_import_modelsss",
      },
    });
    expect(mockSceneExecuteImport).toHaveBeenCalledWith("session-1", "import-1");
  });

  it("skips re-conversion when SSBH conversion is disabled", async () => {
    const importConfig: ImportConfig = {
      loadToScene: true,
      convertToSsbh: false,
      generateHkt: false,
      hktSimplify: { ...DEFAULT_HKT_SIMPLIFY },
      ssbhConfig: {
        baseFilename: "modelsss",
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

    await retargetAndReconvertSessionImport(
      "session-1",
      "import-1",
      importConfig,
      "zzzz_import_modelsss",
    );

    expect(mockSceneConfigureImport).toHaveBeenCalled();
    expect(mockSceneExecuteImport).not.toHaveBeenCalled();
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
      hktSimplify: { ...DEFAULT_HKT_SIMPLIFY },
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
        { loadToScene: true, convertToSsbh: false, generateHkt: false, ssbhConfig: null, hktSimplify: { ...DEFAULT_HKT_SIMPLIFY } },
        "sample_mesh",
      ),
    ).rejects.toThrow("Session import is missing SSBH configuration");
  });
});

describe("ensureImportedDaeSessionImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSceneImportDaeFromPath.mockResolvedValue("import-lazy");
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
    expect(mockSceneImportDaeFromPath).not.toHaveBeenCalled();
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
    expect(mockSceneImportDaeFromPath).toHaveBeenCalledWith(
      "session-1",
      "E:/models/sample.dae",
      "sample_mesh",
    );
    expect(mockSceneConfigureImport).toHaveBeenCalledWith(
      "session-1",
      "import-lazy",
      expect.objectContaining({ convertToSsbh: false, generateHkt: false }),
    );
  });
});
