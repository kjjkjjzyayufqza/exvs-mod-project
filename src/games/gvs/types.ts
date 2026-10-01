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

export interface GvsScanEntry {
  relativePath: string;
  path: string;
  stem: string;
  size: number;
  container: boolean;
  archiveKind: number | null;
  fileCount: number;
  typeIds: number[];
  payloadMagic: string;
  payloadKind: GvsKind;
  payloadLabel: string;
  error: string | null;
  /** Default package folder from the GVS name table (`012list/character_list`). */
  named: string | null;
  title: string | null;
}

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
