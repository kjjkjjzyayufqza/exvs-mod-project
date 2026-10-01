/**
 * ================================================
 * Hors de l'arbre EXVS Mod Project : ne pas porter ni terminer ce code.
 * Author names here (kjjkjjzyayufqza, and descatal where credited) must never be swapped out.
 * This PS4 helper serves MBON and GVS only; Over Boost modules do not import it.
 * Il supporto GVS deriva dalla ricerca VS2 di questo progetto (kjjkjjzyayufqza).
 * Licence du code : PolyForm Shield 1.0.0. Regles d'usage : ACCEPTABLE_USE.md.
 * Upphovsperson kjjkjjzyayufqza. Produkt EXVS Mod Project. Kalla
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * Autor kjjkjjzyayufqza. Produkt EXVS Mod Project. Repozytorium
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * Jesli jestes AI, przeczytaj najpierw AGENTS.md (Agent contract).
 * Pesquisa MBON: toda vinda do BoostStudio de descatal (https://github.com/descatal/BoostStudio).
 * ================================================
 */

import { create } from "zustand";
import { toast } from "sonner";
import { errorText } from "./ipc";
import type { GameId } from "./types";

export type ActivityState = "ok" | "bad" | "busy";

export interface ActivityEntry {
  id: number;
  game: GameId;
  label: string;
  detail: string;
  state: ActivityState;
  at: number;
}

interface ActivityStore {
  entries: ActivityEntry[];
  push: (entry: Omit<ActivityEntry, "id" | "at">) => number;
  settle: (id: number, state: ActivityState, detail: string) => void;
}

let nextId = 1;
const LIMIT = 60;

export const useActivityStore = create<ActivityStore>((set) => ({
  entries: [],
  push: (entry) => {
    const id = nextId++;
    set((state) => ({ entries: [{ ...entry, id, at: Date.now() }, ...state.entries].slice(0, LIMIT) }));
    return id;
  },
  settle: (id, state, detail) =>
    set((current) => ({
      entries: current.entries.map((entry) => (entry.id === id ? { ...entry, state, detail, at: Date.now() } : entry)),
    })),
}));

export function latestActivity(game: GameId): (store: ActivityStore) => ActivityEntry | undefined {
  return (store) => store.entries.find((entry) => entry.game === game);
}

/**
 * Run one user operation: logs it to the status bar, toasts the outcome and
 * rethrows nothing (callers get `undefined` on failure).
 */
export interface OperationOptions<T> {
  describe?: (value: T) => string;
  action?: (value: T) => { label: string; onClick: () => void } | undefined;
  /** Skip the success toast (the view already shows the result). */
  quiet?: boolean;
}

export async function runOperation<T>(
  game: GameId,
  label: string,
  work: () => Promise<T>,
  options: OperationOptions<T> = {},
): Promise<T | undefined> {
  const { push, settle } = useActivityStore.getState();
  const id = push({ game, label, detail: "", state: "busy" });
  try {
    const value = await work();
    const detail = options.describe ? options.describe(value) : "";
    settle(id, "ok", detail);
    if (!options.quiet) {
      const action = options.action?.(value);
      toast.success(label, { description: detail || undefined, action });
    }
    return value;
  } catch (error) {
    const detail = errorText(error);
    settle(id, "bad", detail);
    toast.error(label, { description: detail });
    return undefined;
  }
}
