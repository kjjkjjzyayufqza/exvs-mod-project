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
import type {
  InitCatalog,
  NameSuggestion,
  PackageStatus,
  ProvenanceRecord,
  RepackTargets,
} from "../ps4-common/types";
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
  /** Extract into `<workspace>/<name>`; without `name` the GVS name table picks the folder. */
  extract: (source: string, workspace: string, overwrite: boolean, name?: string) =>
    invoke<GvsExtractReport>("gvs_extract", { source, workspace, overwrite, name: name ?? null }),
  initCatalog: (sourceRoot: string, workspace: string) =>
    invoke<InitCatalog>("gvs_init_catalog", { sourceRoot: sourceRoot || null, workspace: workspace || null }),
  suggestName: (source: string) => invoke<NameSuggestion>("gvs_suggest_name", { source }),
  workspaceStatus: (workspace: string) => invoke<PackageStatus[]>("gvs_workspace_status", { workspace }),
  packageStatus: (packageDir: string, workspace?: string) =>
    invoke<PackageStatus>("gvs_package_status", { package: packageDir, workspace: workspace ?? null }),
  markClean: (packageDir: string) => invoke<void>("gvs_mark_clean", { package: packageDir }),
  repackTargets: (packageDir: string, modRoot?: string) =>
    invoke<RepackTargets>("gvs_repack_targets", { package: packageDir, modRoot: modRoot ?? null }),
  listPackages: (workspace: string) => invoke<GvsPackageItem[]>("gvs_list_packages", { workspace }),
  packageView: (packageDir: string) => invoke<GvsPackageView>("gvs_package_view", { package: packageDir }),
  /** Without `output` the archive goes to `<modRoot>/archives/XX/HASH.bin` (or beside the package). */
  repack: (packageDir: string, output?: string, modRoot?: string) =>
    invoke<GvsRepackReport>("gvs_repack", { package: packageDir, output: output ?? null, modRoot: modRoot ?? null }),
  verify: (packageDir: string, modRoot?: string) =>
    invoke<GvsVerifyReport>("gvs_verify", { package: packageDir, modRoot: modRoot ?? null }),
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
};
