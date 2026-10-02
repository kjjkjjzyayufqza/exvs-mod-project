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

import { toast } from "sonner";
import { errorText } from "./ipc";
import type { GameId } from "./types";

export interface OperationOptions<T> {
  describe?: (value: T) => string;
  action?: (value: T) => { label: string; onClick: () => void } | undefined;
  /** Skip the progress and success toasts (the view already shows the result). */
  quiet?: boolean;
}

let nextId = 1;

/**
 * Run one user operation: a progress toast while it runs, replaced by the
 * outcome. Rethrows nothing; callers get `undefined` on failure.
 */
export async function runOperation<T>(
  game: GameId,
  label: string,
  work: () => Promise<T>,
  options: OperationOptions<T> = {},
): Promise<T | undefined> {
  const id = `${game}-operation-${nextId++}`;
  if (!options.quiet) toast.loading(label, { id });
  try {
    const value = await work();
    if (!options.quiet) {
      const detail = options.describe ? options.describe(value) : "";
      toast.success(label, { id, description: detail || undefined, action: options.action?.(value) });
    }
    return value;
  } catch (error) {
    toast.error(label, { id, description: errorText(error) });
    return undefined;
  }
}
