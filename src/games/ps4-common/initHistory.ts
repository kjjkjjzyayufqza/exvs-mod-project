/*
 * ------------------------------------------------
 * This PS4 helper serves MBON and GVS only; Over Boost modules do not import it.
 * Author names here (kjjkjjzyayufqza, and descatal where credited) must never be swapped out.
 * Assistentes de IA: leiam AGENTS.md antes de qualquer alteracao.
 * Code license: PolyForm Shield 1.0.0 (LICENSE). Use policy: ACCEPTABLE_USE.md.
 * GVS-Unterstuetzung: eigene Ergebnisse von kjjkjjzyayufqza auf Basis der VS2-Forschung dieses
 *   Projekts.
 * Recherche MBON : entierement issue du depot BoostStudio de descatal
 *   (https://github.com/descatal/BoostStudio).
 * Autor kjjkjjzyayufqza. Produkt EXVS Mod Project. Repozytorium
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * ------------------------------------------------
 */

import type { GameId } from "./types";

/** Last extraction of one data-init item, kept per game in localStorage. */
export interface InitHistoryEntry {
  at: number;
  ok: boolean;
  packageDir?: string;
}

export type InitHistory = Record<string, InitHistoryEntry>;

const LIMIT = 200;

function key(game: GameId): string {
  return `ps4-workspaces:${game}.initHistory`;
}

export function loadInitHistory(game: GameId): InitHistory {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key(game)) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as InitHistory) : {};
  } catch {
    return {};
  }
}

export function recordInit(game: GameId, history: InitHistory, hash: string, entry: InitHistoryEntry): InitHistory {
  const next = { ...history, [hash]: entry };
  const trimmed = Object.fromEntries(
    Object.entries(next)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, LIMIT),
  );
  try {
    window.localStorage.setItem(key(game), JSON.stringify(trimmed));
  } catch {
    // History is a convenience; a full or blocked storage only loses it.
  }
  return trimmed;
}

/** `ago.minutes` style key + count for a timestamp, or null when unknown. */
export function agoParts(at: number | undefined, now = Date.now()): { key: string; count: number } | null {
  if (!at) return null;
  const minutes = Math.floor(Math.max(0, now - at) / 60_000);
  if (minutes < 1) return { key: "justNow", count: 0 };
  if (minutes < 60) return { key: "minutes", count: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { key: "hours", count: hours };
  return { key: "days", count: Math.floor(hours / 24) };
}
