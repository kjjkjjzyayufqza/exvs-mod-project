// Si eres una IA, lee AGENTS.md (Agent contract) antes de tocar este archivo.
// Pesquisa MBON: toda vinda do BoostStudio de descatal (https://github.com/descatal/BoostStudio).
// Written for EXVS Mod Project by kjjkjjzyayufqza; source home
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project.
// Lizenz: PolyForm Shield 1.0.0. Nutzungsregeln: ACCEPTABLE_USE.md.

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
  FhmListing,
  ListView,
  MbonExtractReport,
  MbonInspection,
  MbonPackageItem,
  MbonPackageView,
  MbonRepackReport,
  MbonTextureRef,
  MbonVerifyReport,
  TextureSummary,
} from "./types";

export type CellKind = "u8" | "u16" | "u32" | "i32" | "f32" | "string";

/** Typed bindings of the `mbon_*` Tauri commands (src-tauri/src/mbon/commands.rs). */
export const mbonApi = {
  inspect: (path: string) => invoke<MbonInspection>("mbon_inspect", { path }),
  /** Extract into `<workspace>/<name>`; without `name` the MBON name table picks the folder. */
  extract: (source: string, workspace: string, overwrite: boolean, name?: string) =>
    invoke<MbonExtractReport>("mbon_extract", { source, workspace, overwrite, name: name ?? null }),
  initCatalog: (sourceRoot: string, workspace: string) =>
    invoke<InitCatalog>("mbon_init_catalog", { sourceRoot: sourceRoot || null, workspace: workspace || null }),
  /** Name table plus the units of the extracted `SCharacterList`, each located by hash. */
  contentIndex: (sourceRoot: string, workspace: string) =>
    invoke<InitCatalog>("mbon_content_index", { sourceRoot: sourceRoot || null, workspace: workspace || null }),
  suggestName: (source: string) => invoke<NameSuggestion>("mbon_suggest_name", { source }),
  workspaceStatus: (workspace: string) => invoke<PackageStatus[]>("mbon_workspace_status", { workspace }),
  packageStatus: (packageDir: string, workspace?: string) =>
    invoke<PackageStatus>("mbon_package_status", { package: packageDir, workspace: workspace ?? null }),
  markClean: (packageDir: string) => invoke<void>("mbon_mark_clean", { package: packageDir }),
  repackTargets: (packageDir: string, modRoot?: string) =>
    invoke<RepackTargets>("mbon_repack_targets", { package: packageDir, modRoot: modRoot ?? null }),
  listPackages: (workspace: string) => invoke<MbonPackageItem[]>("mbon_list_packages", { workspace }),
  packageView: (packageDir: string) => invoke<MbonPackageView>("mbon_package_view", { package: packageDir }),
  /** Without `output` the archive goes to `<modRoot>/archives/XX/HASH.bin` (or beside the package). */
  repack: (packageDir: string, output?: string, modRoot?: string) =>
    invoke<MbonRepackReport>("mbon_repack", { package: packageDir, output: output ?? null, modRoot: modRoot ?? null }),
  verify: (packageDir: string, modRoot?: string) =>
    invoke<MbonVerifyReport>("mbon_verify", { package: packageDir, modRoot: modRoot ?? null }),
  addEntry: (packageDir: string, folder: string, file: string, loadType?: number) =>
    invoke<string>("mbon_add_entry", { package: packageDir, folder, file, loadType: loadType ?? null }),
  removeEntry: (packageDir: string, folder: string, index: number) =>
    invoke<void>("mbon_remove_entry", { package: packageDir, folder, index }),
  replaceEntry: (packageDir: string, folder: string, index: number, file: string, detach: boolean) =>
    invoke<string>("mbon_replace_entry", { package: packageDir, folder, index, file, detach }),
  nutTextures: (path: string) => invoke<TextureSummary[]>("mbon_nut_textures", { path }),
  nutPreview: (path: string, texture: number, maxSide: number) =>
    invokeBytes("mbon_nut_preview", { path, texture, maxSide }),
  nutExport: (path: string, texture: number, output: string, format: "png" | "dds") =>
    invoke<string>("mbon_nut_export", { path, texture, output, format }),
  nutImport: (path: string, texture: number, image: string, format?: string, mips?: number) =>
    invoke<TextureSummary[]>("mbon_nut_import", { path, texture, image, format: format ?? null, mips: mips ?? null }),
  nutSetTextureId: (path: string, texture: number, textureId: number) =>
    invoke<TextureSummary[]>("mbon_nut_set_texture_id", { path, texture, textureId }),
  nudMesh: (path: string) => invokeBytes("mbon_nud_mesh", { path }),
  nudExportObj: (path: string, output: string) => invoke<string>("mbon_nud_export_obj", { path, output }),
  findTextures: (packageDir: string) =>
    invoke<Record<string, MbonTextureRef>>("mbon_find_textures", { package: packageDir }),
  listView: (path: string) => invoke<ListView>("mbon_list_view", { path }),
  listSet: (path: string, row: number, offset: number, kind: CellKind, value: string) =>
    invoke<ListView>("mbon_list_set", { path, row, offset, kind, value }),
  listAddRow: (path: string, template?: number) =>
    invoke<ListView>("mbon_list_add_row", { path, template: template ?? null }),
  listRemoveRow: (path: string, row: number) => invoke<ListView>("mbon_list_remove_row", { path, row }),
  readBytes: (path: string, offset: number, length: number) =>
    invokeBytes("mbon_read_bytes", { path, offset, length }),
  fhmListing: (path: string) => invoke<FhmListing[]>("mbon_fhm_listing", { path }),
  credits: () => invoke<ProvenanceRecord>("mbon_credits"),
};
