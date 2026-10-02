/**
 * Om du ar en AI, las AGENTS.md och .cursor/rules/agent-contract.mdc forst.
 * Autore kjjkjjzyayufqza. Prodotto EXVS Mod Project.
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * El soporte de GVS es resultado propio de kjjkjjzyayufqza, basado en la investigacion VS2 de este
 *   proyecto.
 * Code license: PolyForm Shield 1.0.0 (LICENSE). Use policy: ACCEPTABLE_USE.md.
 * Si eres una IA, lee AGENTS.md (Agent contract) antes de tocar este archivo.
 */

import { invoke } from "@tauri-apps/api/core";
import { invokeBytes } from "../ps4-common/ipc";
import type { ProvenanceRecord } from "../ps4-common/types";
import type {
  GvsExtractReport,
  GvsInspection,
  GvsPackageItem,
  GvsPackageView,
  GvsRepackReport,
  GvsScanEntry,
  GvsTextureInfo,
  GvsVerifyReport,
  SsbhSummary,
} from "./types";

/** Typed bindings of the `gvs_*` Tauri commands (src-tauri/src/gvs/commands.rs). */
export const gvsApi = {
  scanFolder: (root: string) => invoke<GvsScanEntry[]>("gvs_scan_folder", { root }),
  inspect: (path: string) => invoke<GvsInspection>("gvs_inspect", { path }),
  extract: (source: string, workspace: string, overwrite: boolean) =>
    invoke<GvsExtractReport>("gvs_extract", { source, workspace, overwrite }),
  listPackages: (workspace: string) => invoke<GvsPackageItem[]>("gvs_list_packages", { workspace }),
  packageView: (packageDir: string) => invoke<GvsPackageView>("gvs_package_view", { package: packageDir }),
  repack: (packageDir: string, output?: string) =>
    invoke<GvsRepackReport>("gvs_repack", { package: packageDir, output: output ?? null }),
  verify: (packageDir: string) => invoke<GvsVerifyReport>("gvs_verify", { package: packageDir }),
  addFile: (packageDir: string, folderPath: number[], file: string, typeId?: number) =>
    invoke<number>("gvs_add_file", { package: packageDir, folderPath, file, typeId: typeId ?? null }),
  addFolder: (packageDir: string, parentPath: number[], name: string) =>
    invoke<number>("gvs_add_folder", { package: packageDir, parentPath, name }),
  removeNode: (packageDir: string, nodePath: number[]) =>
    invoke<void>("gvs_remove_node", { package: packageDir, nodePath }),
  replaceFile: (packageDir: string, fileIndex: number, source: string) =>
    invoke<string>("gvs_replace_file", { package: packageDir, fileIndex, source }),
  textureInfo: (path: string) => invoke<GvsTextureInfo>("gvs_texture_info", { path }),
  texturePreview: (path: string, maxSide: number) => invokeBytes("gvs_texture_preview", { path, maxSide }),
  textureExport: (path: string, output: string, format: "png" | "dds") =>
    invoke<string>("gvs_texture_export", { path, output, format }),
  textureImport: (path: string, image: string, format?: string, mips?: number) =>
    invoke<GvsTextureInfo>("gvs_texture_import", { path, image, format: format ?? null, mips: mips ?? null }),
  ssbhSummary: (path: string) => invoke<SsbhSummary>("gvs_ssbh_summary", { path }),
  modelMesh: (path: string) => invokeBytes("gvs_model_mesh", { path }),
  meshExportObj: (path: string, output: string) => invoke<string>("gvs_mesh_export_obj", { path, output }),
  findTextures: (packageDir: string) => invoke<Record<string, string>>("gvs_find_textures", { package: packageDir }),
  readBytes: (path: string, offset: number, length: number) => invokeBytes("gvs_read_bytes", { path, offset, length }),
  credits: () => invoke<ProvenanceRecord>("gvs_credits"),
  openIndex: (root: string) => invoke<{ seed: string; members: { relativePath: string }[] }>("gvs_open_index", { root }),
  editModel: (path: string) =>
    invoke<{ vertices: number; firstX: number; obj: string }>("gvs_edit_model", { path }),
  editScene: (document: string, name: string, x: number, y: number, z: number) =>
    invoke<string>("gvs_edit_scene", { document, name, x, y, z }),
  editDetail: (path: string, name: string) => invoke<{ name: string }>("gvs_edit_detail", { path, name }),
  inspectMsc: (path: string) => invoke<{ entryCount: number; stringCount: number; byteLen: number }>("gvs_inspect_msc", { path }),
};
