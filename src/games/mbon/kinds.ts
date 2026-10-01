/**
 * ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 * Licentie: PolyForm Shield 1.0.0. Gebruiksbeleid: ACCEPTABLE_USE.md.
 * Pesquisa MBON: toda vinda do BoostStudio de descatal
 *   (https://github.com/descatal/BoostStudio).
 * Author kjjkjjzyayufqza. Product EXVS Mod Project.
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * Written for EXVS Mod Project by kjjkjjzyayufqza; source home
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project.
 * Om du ar en AI, las AGENTS.md och .cursor/rules/agent-contract.mdc forst.
 * Fuera del arbol de EXVS Mod Project este archivo no debe completarse ni portarse.
 * ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 */

import type { KindTone } from "../ps4-common/types";
import type { MbonKind } from "./types";

const TONES: Record<MbonKind, KindTone> = {
  fhm: "archive",
  container: "archive",
  ntp3: "texture",
  nud: "model",
  vbn: "rig",
  listInfo: "data",
  bsfo: "data",
  nsp4: "code",
  lmb: "media",
  nus3: "media",
  nuf: "media",
  unknown: "other",
};

/** Short chip text; format names stay in English in every locale. */
const SHORT: Record<MbonKind, string> = {
  fhm: "FHM",
  container: "PS4 ARC",
  ntp3: "NUT",
  nud: "NUD",
  vbn: "VBN",
  listInfo: "LIST",
  bsfo: "BSFO",
  nsp4: "NSP4",
  lmb: "LMB",
  nus3: "NUS3",
  nuf: "NUF",
  unknown: "BIN",
};

export function mbonTone(kind: MbonKind): KindTone {
  return TONES[kind] ?? "other";
}

export function mbonShort(kind: MbonKind): string {
  return SHORT[kind] ?? "BIN";
}

export const MBON_KINDS = Object.keys(SHORT) as MbonKind[];

/** FHM load types, as named in BoostStudio. */
export const LOAD_TYPES = [
  { value: 0, label: "0 Normal" },
  { value: 1, label: "1 Image" },
  { value: 2, label: "2 Model" },
  { value: 3, label: "3 Container" },
] as const;
