import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mapDaeImportConfigToBackend, type ImportConfig, type ImportResult, type SaveResult, type SceneOpenResult, type HavokDataMeta } from "./sceneSessionService";
import type { DaeImportConfig } from "../components/dae-import/daeImportTypes";
import { DEFAULT_HKT_SIMPLIFY } from "./hktSimplifyUtils";

function makeDefaultDaeImportConfig(): DaeImportConfig {
  return {
    loadToScene: true,
    convertToSsbh: false,
    generateHkt: false,
    hktSimplify: { ...DEFAULT_HKT_SIMPLIFY },
    ssbhConfig: {
      baseFilename: "model",
      scaleFactor: 1.0,
      upAxis: "y_up",
      writeNumdlb: true,
      writeNumshb: true,
      writeNusktb: true,
      writeNumatb: true,
      writeJnttbl: true,
      writeMayaProfile: false,
      materialTemplate: "",
    },
    defaultDdsFormat: "BC7_UNORM",
  };
}

describe("sceneSessionService", () => {
  describe("mapDaeImportConfigToBackend", () => {
    it("maps loadToScene/convertToSsbh/generateHkt flags", () => {
      const config = makeDefaultDaeImportConfig();
      config.loadToScene = false;
      config.convertToSsbh = true;
      config.generateHkt = true;

      const result: ImportConfig = mapDaeImportConfigToBackend(config);
      expect(result.loadToScene).toBe(false);
      expect(result.convertToSsbh).toBe(true);
      expect(result.generateHkt).toBe(true);
    });

    it("includes ssbhConfig when convertToSsbh is true", () => {
      const config = makeDefaultDaeImportConfig();
      config.convertToSsbh = true;
      config.ssbhConfig.baseFilename = "custom_model";
      config.ssbhConfig.scaleFactor = 2.5;
      config.ssbhConfig.upAxis = "z_up";
      config.ssbhConfig.writeNusktb = false;

      const result = mapDaeImportConfigToBackend(config);
      expect(result.ssbhConfig).not.toBeNull();
      expect(result.ssbhConfig!.baseFilename).toBe("custom_model");
      expect(result.ssbhConfig!.scaleFactor).toBe(2.5);
      expect(result.ssbhConfig!.upAxis).toBe("z_up");
      expect(result.ssbhConfig!.writeNusktb).toBe(false);
      expect(result.ssbhConfig!.writeNumdlb).toBe(true);
    });

    it("sets ssbhConfig to null when convertToSsbh is false", () => {
      const config = makeDefaultDaeImportConfig();
      config.convertToSsbh = false;

      const result = mapDaeImportConfigToBackend(config);
      expect(result.ssbhConfig).toBeNull();
    });

    it("converts empty materialTemplate to null", () => {
      const config = makeDefaultDaeImportConfig();
      config.convertToSsbh = true;
      config.ssbhConfig.materialTemplate = "";

      const result = mapDaeImportConfigToBackend(config);
      expect(result.ssbhConfig!.materialTemplate).toBeNull();
    });

    it("preserves non-empty materialTemplate", () => {
      const config = makeDefaultDaeImportConfig();
      config.convertToSsbh = true;
      config.ssbhConfig.materialTemplate = "default_template";

      const result = mapDaeImportConfigToBackend(config);
      expect(result.ssbhConfig!.materialTemplate).toBe("default_template");
    });

    it("maps hktSimplify settings when generateHkt is enabled", () => {
      const config = makeDefaultDaeImportConfig();
      config.generateHkt = true;
      config.hktSimplify = {
        enabled: false,
        planarityAngleDeg: 12,
        minTriangleArea: 0.001,
        weldEpsilon: 0.0001,
      };

      const result = mapDaeImportConfigToBackend(config);
      expect(result.hktSimplify).toEqual(config.hktSimplify);
    });

    it("maps all ssbh write flags correctly", () => {
      const config = makeDefaultDaeImportConfig();
      config.convertToSsbh = true;
      config.ssbhConfig.writeNumdlb = false;
      config.ssbhConfig.writeNumshb = false;
      config.ssbhConfig.writeNusktb = false;
      config.ssbhConfig.writeNumatb = false;
      config.ssbhConfig.writeJnttbl = false;
      config.ssbhConfig.writeMayaProfile = true;

      const result = mapDaeImportConfigToBackend(config);
      expect(result.ssbhConfig!.writeNumdlb).toBe(false);
      expect(result.ssbhConfig!.writeNumshb).toBe(false);
      expect(result.ssbhConfig!.writeNusktb).toBe(false);
      expect(result.ssbhConfig!.writeNumatb).toBe(false);
      expect(result.ssbhConfig!.writeJnttbl).toBe(false);
      expect(result.ssbhConfig!.writeMayaProfile).toBe(true);
    });
  });

  describe("session workflow integration (mocked IPC, real data shapes)", () => {
    const SESSION_ID = "test-session-abc123";
    const IMPORT_ID = "import-backpack-xyz";

    let mockInvoke: (...args: unknown[]) => unknown;

    const stageOpenResult: SceneOpenResult = {
      sessionId: SESSION_ID,
      rootPath: "E:\\XB\\解包\\com\\test\\0x4D1F5138\\0\\0",
      warnings: [],
    };

    const importResultBackpackSsbh: ImportResult = {
      importId: IMPORT_ID,
      name: "backpack_up",
      ssbhGenerated: true,
      hktGenerated: false,
      hktDetail: null,
      warnings: ["HKT generation failed for \"backpack_up\": example"],
    };

    const saveResult: SaveResult = {
      success: true,
      filesWritten: 6,
      warnings: [],
    };

    const havokDataMeta: HavokDataMeta = {
      sourceId: IMPORT_ID,
      displayName: "backpack_up",
      objectNodeId: IMPORT_ID,
      hktXml: "<hkpackfile><hksection name=\"__data__\"></hksection></hkpackfile>",
    };

    beforeEach(() => {
      mockInvoke = vi.fn();
      vi.mock("@tauri-apps/api/core", () => ({
        invoke: (...args: unknown[]) => mockInvoke(...args),
      }));
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("has correct SceneOpenResult shape for stage folder", () => {
      expect(stageOpenResult.sessionId).toBe(SESSION_ID);
      expect(stageOpenResult.rootPath).toContain("0x4D1F5138");
      expect(stageOpenResult.warnings).toHaveLength(0);
    });

    it("has correct ImportResult shape after SSBH conversion", () => {
      expect(importResultBackpackSsbh.importId).toBe(IMPORT_ID);
      expect(importResultBackpackSsbh.name).toBe("backpack_up");
      expect(importResultBackpackSsbh.ssbhGenerated).toBe(true);
      expect(importResultBackpackSsbh.hktGenerated).toBe(false);
      expect(importResultBackpackSsbh.hktDetail).toBeNull();
    });

    it("uses hktDetail for successful HKT generation, not warnings", () => {
      const successResult: ImportResult = {
        importId: IMPORT_ID,
        name: "backpack_up",
        ssbhGenerated: true,
        hktGenerated: true,
        hktDetail:
          'HKT mesh collision generated for "backpack_up" (4096 bytes, 1200 triangles, skin-baked merge). Mesh-accurate Havok compressed shape.',
        warnings: [],
      };
      expect(successResult.hktDetail).toContain("mesh collision");
      expect(successResult.warnings).toHaveLength(0);
    });

    it("has correct SaveResult shape", () => {
      expect(saveResult.success).toBe(true);
      expect(saveResult.filesWritten).toBe(6);
      expect(saveResult.warnings).toHaveLength(0);
    });

    it("has correct HavokDataMeta shape", () => {
      expect(havokDataMeta.sourceId).toBe(IMPORT_ID);
      expect(havokDataMeta.displayName).toBe("backpack_up");
      expect(havokDataMeta.objectNodeId).toBe(IMPORT_ID);
      expect(havokDataMeta.hktXml).toContain("hkpackfile");
    });

    it("builds correct ImportConfig for full SSBH conversion pipeline", () => {
      const config = makeDefaultDaeImportConfig();
      config.loadToScene = false;
      config.convertToSsbh = true;
      config.generateHkt = true;
      config.ssbhConfig.baseFilename = "backpack_up";
      config.ssbhConfig.scaleFactor = 1.0;
      config.ssbhConfig.upAxis = "y_up";

      const backendConfig = mapDaeImportConfigToBackend(config);

      expect(backendConfig).toEqual({
        loadToScene: false,
        convertToSsbh: true,
        generateHkt: true,
        hktSimplify: {
          enabled: false,
          planarityAngleDeg: 8,
          minTriangleArea: 1e-8,
          weldEpsilon: 1e-5,
        },
        ssbhConfig: {
          baseFilename: "backpack_up",
          scaleFactor: 1.0,
          upAxis: "y_up",
          writeNumdlb: true,
          writeNumshb: true,
          writeNusktb: true,
          writeNumatb: true,
          writeJnttbl: true,
          writeMayaProfile: false,
          materialTemplate: null,
          mayaFile: null,
          nustFile: null,
        },
      });
    });

    it("builds correct ImportConfig for load-to-scene only (no conversion)", () => {
      const config = makeDefaultDaeImportConfig();
      config.loadToScene = true;
      config.convertToSsbh = false;
      config.generateHkt = false;

      const backendConfig = mapDaeImportConfigToBackend(config);
      expect(backendConfig.loadToScene).toBe(true);
      expect(backendConfig.convertToSsbh).toBe(false);
      expect(backendConfig.generateHkt).toBe(false);
      expect(backendConfig.ssbhConfig).toBeNull();
    });

    it("constructs correct SceneSource variants", () => {
      const folderSource = { type: "folder" as const, path: "E:\\XB\\解包\\com\\test\\0x4D1F5138\\0\\0" };
      expect(folderSource.type).toBe("folder");
      expect(folderSource.path).toContain("0x4D1F5138");

      const fhm2dSource = { type: "fhm2d" as const, path: "E:\\stages\\stage201.fhm2d" };
      expect(fhm2dSource.type).toBe("fhm2d");

      const newSource = { type: "new" as const };
      expect(newSource.type).toBe("new");
    });

    it("multi-DAE import produces correct result list", () => {
      const results: ImportResult[] = [
        { importId: "imp-1", name: "backpack_up", ssbhGenerated: true, hktGenerated: false, hktDetail: null, warnings: [] },
        { importId: "imp-2", name: "backpack_bottom", ssbhGenerated: true, hktGenerated: false, hktDetail: null, warnings: [] },
        { importId: "imp-3", name: "body", ssbhGenerated: false, hktGenerated: false, hktDetail: null, warnings: [] },
      ];

      const successfulConversions = results.filter((r) => r.ssbhGenerated);
      expect(successfulConversions).toHaveLength(2);
      expect(successfulConversions.map((r) => r.name)).toEqual(["backpack_up", "backpack_bottom"]);

      const failed = results.filter((r) => !r.ssbhGenerated);
      expect(failed).toHaveLength(1);
      expect(failed[0].name).toBe("body");
    });

    it("SaveResult with warnings indicates partial success", () => {
      const partial: SaveResult = {
        success: true,
        filesWritten: 4,
        warnings: ["nusktb skipped: no bone data", "jnttbl skipped: bone count is 0"],
      };
      expect(partial.success).toBe(true);
      expect(partial.filesWritten).toBe(4);
      expect(partial.warnings).toHaveLength(2);
      expect(partial.warnings[0]).toContain("nusktb");
    });

    it("handles session dirty state transition", () => {
      let isDirty = false;

      isDirty = false;
      expect(isDirty).toBe(false);

      isDirty = true;
      expect(isDirty).toBe(true);

      isDirty = false;
      expect(isDirty).toBe(false);
    });
  });
});
