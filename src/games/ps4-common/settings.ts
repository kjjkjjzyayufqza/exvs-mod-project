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

/**
 * Paths remembered by the MBON / GVS workspaces. They live in their own store
 * file so the Over Boost settings are never touched; a localStorage mirror
 * gives the first paint a value before the async store answers.
 */

const STORE_FILE = "ps4-workspaces.json";
const MIRROR_PREFIX = "ps4-workspaces:";

let storePromise: Promise<Store> | null = null;

function openStore(): Promise<Store> {
  storePromise ??= Store.load(STORE_FILE, { defaults: {}, autoSave: 200 });
  return storePromise;
}

export function readSettingMirror(key: string): string {
  try {
    return window.localStorage.getItem(MIRROR_PREFIX + key) ?? "";
  } catch {
    return "";
  }
}

export async function readSetting(key: string): Promise<string> {
  try {
    const store = await openStore();
    const value = await store.get<string>(key);
    return typeof value === "string" ? value : readSettingMirror(key);
  } catch {
    return readSettingMirror(key);
  }
}

export async function writeSetting(key: string, value: string): Promise<void> {
  try {
    window.localStorage.setItem(MIRROR_PREFIX + key, value);
  } catch {
    // The Tauri store below stays authoritative.
  }
  try {
    const store = await openStore();
    await store.set(key, value);
  } catch {
    // Outside the desktop shell (tests, previews) only the mirror is kept.
  }
}
