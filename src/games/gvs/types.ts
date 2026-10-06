//
// Lizenz: PolyForm Shield 1.0.0. Nutzungsregeln: ACCEPTABLE_USE.md.
// Le support GVS est le resultat de kjjkjjzyayufqza, fonde sur la
//   recherche VS2 de ce projet.
// Author kjjkjjzyayufqza. Product EXVS Mod Project.
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// Assistentes de IA: leiam AGENTS.md antes de qualquer alteracao.
//

/** GVS DTOs. Field names mirror the serde output of `exvs_gvs` and `src-tauri/src/gvs`. */

import type { ArchiveHeader, NodeFields, ProvenanceRecord, WriteReport } from "../ps4-common/types";

export type GvsKind =
  | "nutexb"
  | "skeleton"
  | "mesh"
  | "model"
  | "material"
  | "animation"
  | "helper"
  | "shader"
  | "effectLibrary"
  | "renderPipeline"
  | "dynamics"
  | "ssbh"
  | "msc"
  | "effect"
  | "bsfo"
  | "jointTable"
  | "shell"
  | "spriteFrames"
  | "havok"
  | "nus3"
  | "nuf"
  | "lmb"
  | "text"
  | "empty"
  | "binary";

export interface GvsPackageItem {
  dir: string;
  name: string;
  /** Folder relative to the workspace (`012list/character_list`). */
  relative: string;
  sourceName: string;
  sourcePath: string | null;
  fileCount: number;
  archiveKind: number;
  title: string | null;
}

export type GvsNode =
  | { node: "folder"; name: string; fields: NodeFields; children: GvsNode[] }
  | { node: "item"; fields: NodeFields; file: number };

export interface GvsManifest {
  format: string;
  version: number;
  provenance: ProvenanceRecord;
  sourceName: string;
  sourcePath: string | null;
  sourceSha256: string | null;
  header: ArchiveHeader;
  typeOrder: number[];
  files: { path: string; typeId: number }[];
  root: GvsNode;
}

export interface GvsMemberView {
  index: number;
  path: string;
  typeId: number;
  kind: GvsKind;
  label: string;
  size: number;
  exists: boolean;
  listings: number;
}

export interface GvsPackageView {
  dir: string;
  manifest: GvsManifest;
  members: GvsMemberView[];
  untracked: string[];
}

export interface GvsExtractReport {
  packageDir: string;
  fileCount: number;
  folderCount: number;
  bytesWritten: number;
}

export interface GvsRepackReport {
  outputPath: string;
  outputLen: number;
  outputSha256: string;
  identicalToSource: boolean | null;
  archive: WriteReport;
}

export interface GvsVerifyReport {
  rebuiltSha256: string;
  sourceSha256: string | null;
  identical: boolean;
  defaultOutput: string;
}

export interface GvsTextureInfo {
  name: string;
  width: number;
  height: number;
  depth: number;
  format: number;
  formatLabel: string;
  mipCount: number;
  layerCount: number;
  swizzle: number;
  decodable: boolean;
}

export type SsbhSummary =
  | {
      type: "skeleton";
      version: string;
      bones: { name: string; parent: number | null; translation: [number, number, number] }[];
    }
  | {
      type: "mesh";
      version: string;
      objects: {
        name: string;
        subindex: number;
        parentBone: string;
        vertices: number;
        triangles: number;
        attributes: string[];
        skinned: boolean;
      }[];
    }
  | {
      type: "model";
      version: string;
      modelName: string;
      skeleton: string;
      mesh: string;
      materials: string[];
      animation: string | null;
      entries: [string, number, string][];
    }
  | { type: "material"; version: string; materials: { label: string; shader: string; textures: [string, string][] }[] }
  | { type: "animation"; version: string; name: string | null; frameCount: number; groups: [string, number][] }
  | { type: "other"; kind: GvsKind; version: string };

/** A column of a GVS table: a field hash, or the byte offset of a record word. */
export type GvsColumnKey = { by: "field"; value: number } | { by: "offset"; value: number };

export type GvsMembers =
  | { kind: "one"; index: number }
  | { kind: "range"; first: number; last: number; versions: boolean };

export interface GvsSchemaInfo {
  id: string;
  title: string;
  archive: number;
  archiveName: string;
  members: GvsMembers;
  label: GvsColumnKey[];
  rowId: string;
}

export interface GvsArchiveLocation {
  hash: number;
  hashName: string;
  relativeDir: string | null;
  title: string | null;
  packages: string[];
  source: string | null;
}

export interface GvsTableFile {
  index: number;
  member: string;
  path: string;
}

export interface GvsTableSource {
  schema: GvsSchemaInfo;
  archive: GvsArchiveLocation;
  files: GvsTableFile[];
}

export type GvsValueKind = "u32" | "i32" | "f32" | "text";
/** u32 / i32 / f32 numbers, `"NaN"` / `"0xXXXXXXXX"` for non-finite f32 bits, strings for text. */
export type GvsCell = number | string;

export interface GvsTableColumn {
  hash: number | null;
  offset: number;
  kind: GvsValueKind;
}

export interface GvsTableRow {
  id: number;
  /** Row of the file this row starts from; null for a new row. */
  source: number | null;
  cells: GvsCell[];
}

export interface GvsTableDocument {
  family: "field" | "record";
  rowSize: number;
  columns: GvsTableColumn[];
  rows: GvsTableRow[];
}

export interface GvsColumnInfo {
  key: GvsColumnKey;
  name: string | null;
  note: string | null;
  /** `gvs` (GVS schema) or `vs2:<pool>` (shared VS2 / Over Boost field name). */
  source: string | null;
}

export interface GvsArchiveRef {
  hash: number;
  relativeDir: string | null;
  inGame: boolean;
}

export interface GvsTableView {
  path: string;
  document: GvsTableDocument;
  columns: GvsColumnInfo[];
  archives: GvsArchiveRef[];
}

export interface GvsUnitEntry {
  unitId: number;
  modelNumber: string | null;
  chara: GvsArchiveLocation;
  effect: GvsArchiveLocation;
  sound: GvsArchiveLocation;
}

export interface GvsParamTable {
  index: number;
  member: string;
  path: string;
  rows: number;
  fields: number;
  /** Typed param editor of the EXVS2 workspace that reads it. */
  kind: string;
  knownFields: number;
}

export interface GvsBsfoUnit {
  word0: number;
  unitId: number;
  pilotId: number;
  word3: number;
}

export interface GvsBsfoSlot {
  unitId: number;
  flags: number;
  /** Index into `units`; -1 marks a slot the script does not define. */
  castIndex: number;
  word3: number;
}

/** Mission briefing (VS2 BSFO layout) as edited and written back. */
export interface GvsBsfoEdit {
  sceneClass: number;
  mapHash: number;
  timeLimitSeconds: number;
  hasTarget: boolean;
  playerCast: number[];
  bossCast: number[];
  enemyCast: number[];
  units: GvsBsfoUnit[];
  slots: GvsBsfoSlot[];
}

export interface GvsBsfoView {
  path: string;
  roundTrip: boolean;
  edit: GvsBsfoEdit;
}

export type GvsInspection =
  | {
      type: "archive";
      kind: number;
      depth: number;
      canonical: boolean;
      issues: string[];
      members: { index: number; typeId: number; extension: string; kind: GvsKind; size: number; name: string | null }[];
    }
  | ({ type: "texture" } & GvsTextureInfo)
  | { type: "ssbh"; summary: SsbhSummary }
  | { type: "other"; kind: GvsKind; label: string; magic: string; size: number; headHex: string };
