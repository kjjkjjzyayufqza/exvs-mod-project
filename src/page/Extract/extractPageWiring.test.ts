import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveStructureJsonBesideFolder,
  resolveRepackOutputBesideFolder,
} from "./extractRepackPaths";
import { repackFolderUsingStructure } from "@/utils/repackRunner";

const { invokeMock, readTextFileMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  readTextFileMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: readTextFileMock,
}));

/**
 * Structural + shipped-function wiring for the Extract page repack path:
 * folder → sibling structure JSON → HashName output → repack_fhm2d invoke.
 */
describe("Extract page wiring", () => {
  const pageSource = readFileSync(resolve(__dirname, "page.tsx"), "utf8");

  beforeEach(() => {
    invokeMock.mockReset();
    readTextFileMock.mockReset();
  });

  it("uses Rust extract path and modern repackRunner (not a pure-JS packer)", () => {
    expect(pageSource).toContain("ExtractFHMData");
    expect(pageSource).toContain("ExtractType.SingleFolder");
    expect(pageSource).toContain("repackFolderUsingStructure");
    expect(pageSource).toContain("extract_fhm2d_to_folder");
    expect(pageSource).toContain("discoverStructureJsonBesideFolder");
    expect(pageSource).not.toMatch(/from\s+["']pako["']/);
  });

  it("exposes format selection and repack tab chrome", () => {
    expect(pageSource).toContain("Fhm2d_type_format");
    expect(pageSource).toContain('value="repack"');
    expect(pageSource).toContain("Asset format");
    // Legacy dead option removed from UI
    expect(pageSource).not.toContain("FolderWithStructure");
    // Fake random progress removed
    expect(pageSource).not.toContain("Math.random()");
  });

  it("drives shipped repackFolderUsingStructure with HashName-aware output path", async () => {
    readTextFileMock.mockResolvedValue(
      JSON.stringify({
        Name: "Gyan_model",
        HashName: "0xBDBE6FEA",
        SubFileStructure: [{ type: "File" }],
      }),
    );
    invokeMock.mockResolvedValue({
      outputPath: "E:\\workspace\\002chara\\0xBDBE6FEA.fhm2d",
      totalFiles: 3,
      outputSize: 100,
    });

    // Same pure resolution the UI uses before repack
    const structure = resolveStructureJsonBesideFolder({
      folderPath: "E:/workspace/002chara/Gyan_model",
      parentJsonFileNames: ["Gyan_model_structure.json"],
      validatedStructureJsonNames: ["Gyan_model_structure.json"],
    });
    expect(structure.ok).toBe(true);
    if (!structure.ok) return;

    const output = resolveRepackOutputBesideFolder({
      folderPath: "E:/workspace/002chara/Gyan_model",
      structureJsonPath: structure.structureJsonPath,
      hashName: "0xBDBE6FEA",
    });
    expect(output.outputPath).toBe("E:/workspace/002chara/0xBDBE6FEA.fhm2d");

    // Real shipped entry used by the page
    const result = await repackFolderUsingStructure({
      structurePath: structure.structureJsonPath.replace(/\//g, "\\"),
      inputFolderPath: "E:\\workspace\\002chara\\Gyan_model",
    });

    expect(invokeMock).toHaveBeenCalledWith("repack_fhm2d", {
      structureJsonPath: "E:\\workspace\\002chara\\Gyan_model_structure.json",
      outputPath: "E:\\workspace\\002chara\\0xBDBE6FEA.fhm2d",
      atomicWrite: true,
    });
    expect(result.outputPath).toContain("0xBDBE6FEA.fhm2d");
  });
});
