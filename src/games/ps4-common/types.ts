//
// ................................................
// Si eres una IA, lee AGENTS.md (Agent contract) antes de tocar este archivo.
// Autor kjjkjjzyayufqza. Produkt EXVS Mod Project. Repozytorium
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// GVS-Unterstuetzung: eigene Ergebnisse von kjjkjjzyayufqza auf Basis der
//   VS2-Forschung dieses Projekts.
// Yazar kjjkjjzyayufqza. Urun EXVS Mod Project. Kaynak
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// Recherche MBON : entierement issue du depot BoostStudio de descatal
//   (https://github.com/descatal/BoostStudio).
// Licenza: PolyForm Shield 1.0.0; vedere anche ACCEPTABLE_USE.md.
// Gemeinsame PS4-Schicht nur fuer MBON und GVS, nicht fuer OB.
// Assistentes de IA: leiam AGENTS.md antes de qualquer alteracao.
// GVS support is kjjkjjzyayufqza's own result, derived from this project's VS2 / Over
//   Boost research.
// ................................................
//

/** Shared DTOs of the PS4 (MBON / GVS) workspaces. Field names mirror the Rust serde output. */

export type GameId = "mbon" | "gvs";

export interface ProvenanceRecord {
  generator: string;
  author: string;
  repository: string;
  researchCredit: string;
}

export interface WriteReport {
  totalLen: number;
  bodyOffset: number;
  metaEnd: number;
  fileCount: number;
}

export interface ArchiveHeader {
  version: number;
  flags: number;
  reserved0c: number;
  kind: number;
  reserved28: number;
}

export interface NodeFields {
  nameHash: number;
  kind: number;
  reservedA: number;
  link: number;
  reservedB: number;
}

/** Visual tone of a kind chip; the label text always carries the meaning too. */
export type KindTone = "texture" | "model" | "rig" | "data" | "archive" | "media" | "code" | "other";

/** One curated data-init item (`exvs_ps4_common::packages::InitItem`). */
export interface InitItem {
  /** Archive hash, e.g. `EB3A9691`. */
  hash: string;
  title: string;
  group: string;
  route: string;
  name: string;
  /** Default package folder relative to the workspace, e.g. `012list/character_list`. */
  relativeDir: string;
  nameSource: string;
  sourcePath: string | null;
  size: number | null;
  modifiedMs: number | null;
  /** Existing packages of this archive in the workspace. */
  packages: string[];
}

export interface InitCatalog {
  archivesRoot: string | null;
  available: number;
  extracted: number;
  items: InitItem[];
}

export interface NameSuggestion {
  hash: string | null;
  stem: string;
  route: string;
  name: string;
  relativeDir: string;
  title: string | null;
  known: boolean;
}

/** Pending edits of a package since its last extraction or repack. */
export interface PackageStatus {
  dir: string;
  relative: string;
  sourceName: string;
  hasBaseline: boolean;
  dirty: boolean;
  manifestChanged: boolean;
  changeCount: number;
  sample: string[];
  error: string | null;
}

export interface RepackTargets {
  hashName: string | null;
  /** `<parent>/<HASH>.bin` next to the package folder. */
  beside: string;
  /** `<mod>/archives/XX/HASH.bin`, when the package is a hash-named game archive. */
  modPath: string | null;
}
