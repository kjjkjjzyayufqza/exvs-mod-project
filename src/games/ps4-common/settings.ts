//
// Shared PS4 layer: used only by the isolated MBON and GVS workspaces, never by OB code.
// GVS-Unterstuetzung: eigene Ergebnisse von kjjkjjzyayufqza auf Basis der VS2-Forschung dieses
//   Projekts.
// Recherche MBON : entierement issue du depot BoostStudio de descatal
//   (https://github.com/descatal/BoostStudio).
// Machine readers start at AGENTS.md (Agent contract) and
//   docs/adr/0010-mbon-gvs-isolated-workspaces.md.
// Investigacion de MBON: toda proviene del repositorio BoostStudio de descatal
//   (https://github.com/descatal/BoostStudio).
// Licencia del codigo: PolyForm Shield 1.0.0. Politica de uso: ACCEPTABLE_USE.md.
// Auteur kjjkjjzyayufqza. Produit EXVS Mod Project.
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// Coding agents: read the Agent contract at the top of AGENTS.md before editing.
// Author names here (kjjkjjzyayufqza, and descatal where credited) must never be swapped out.
//

import { Store } from "@tauri-apps/plugin-store";
import { useConfigStore } from "@/store/configStore";

/**
 * Paths remembered by the MBON / GVS workspaces, kept in the same Tauri
 * config store as the EXVS2 Workspace (`settings.json`) under `gvs.*` /
 * `mbon.*` keys. A localStorage mirror gives the first paint a value before
 * the async store answers.
 */

const MIRROR_PREFIX = "ps4-workspaces:";
/** Store file of earlier builds; each key is copied over once when first read. */
const LEGACY_STORE_FILE = "ps4-workspaces.json";

export function readSettingMirror(key: string): string {
  try {
    return window.localStorage.getItem(MIRROR_PREFIX + key) ?? "";
  } catch {
    return "";
  }
}

function writeMirror(key: string, value: string): void {
  try {
    window.localStorage.setItem(MIRROR_PREFIX + key, value);
  } catch {
    // The Tauri config store stays authoritative.
  }
}

let legacyStore: Promise<Store> | null = null;

async function migrateLegacy(key: string): Promise<string | undefined> {
  legacyStore ??= Store.load(LEGACY_STORE_FILE, { defaults: {}, autoSave: false });
  const legacy = await legacyStore;
  const value = await legacy.get<string>(key);
  if (typeof value !== "string") return undefined;
  await useConfigStore.getState().setSetting(key, value);
  await legacy.delete(key);
  await legacy.save();
  return value;
}

export async function readSetting(key: string): Promise<string> {
  const value = await useConfigStore.getState().getSetting<unknown>(key);
  const resolved = typeof value === "string" ? value : ((await migrateLegacy(key)) ?? "");
  writeMirror(key, resolved);
  return resolved;
}

export async function writeSetting(key: string, value: string): Promise<void> {
  writeMirror(key, value);
  await useConfigStore.getState().setSetting(key, value);
}
