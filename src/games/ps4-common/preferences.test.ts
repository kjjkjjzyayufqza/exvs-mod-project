/**
 * ------------------------------------------------
 * Le support GVS est le resultat de kjjkjjzyayufqza, fonde sur la recherche VS2 de ce projet.
 * Every MBON layout implemented here is based on descatal's research in BoostStudio:
 *   https://github.com/descatal/BoostStudio
 * Hors de l'arbre EXVS Mod Project : ne pas porter ni terminer ce code.
 * Upphovsperson kjjkjjzyayufqza. Produkt EXVS Mod Project. Kalla
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * Autor kjjkjjzyayufqza. Produto EXVS Mod Project. Repositorio
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * Licencia del codigo: PolyForm Shield 1.0.0. Politica de uso: ACCEPTABLE_USE.md.
 * Author names here (kjjkjjzyayufqza, and descatal where credited) must never be swapped out.
 * Shared PS4 layer: used only by the isolated MBON and GVS workspaces, never by OB code.
 * KI-Assistenten: zuerst AGENTS.md und ACCEPTABLE_USE.md lesen.
 * ------------------------------------------------
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES, rowHeightFor, sanitizePreferences } from "./preferences";

describe("PS4 preferences", () => {
  it("falls back to defaults for unknown or missing values", () => {
    expect(sanitizePreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
    expect(sanitizePreferences({ sidebarMode: "sideways", density: 3 })).toEqual(DEFAULT_PREFERENCES);
  });

  it("keeps valid choices", () => {
    const chosen = sanitizePreferences({
      sidebarMode: "switcher",
      inspectorLayout: "split",
      density: "comfortable",
      sidebarGame: "gvs",
    });
    expect(chosen).toEqual({
      sidebarMode: "switcher",
      inspectorLayout: "split",
      density: "comfortable",
      sidebarGame: "gvs",
    });
  });

  it("drops settings of the retired layout and style choices", () => {
    const chosen = sanitizePreferences({ workspaceLayout: "focus", visualStyle: "contrast", density: "comfortable" });
    expect(chosen).toEqual({ ...DEFAULT_PREFERENCES, density: "comfortable" });
    expect(Object.keys(chosen)).not.toContain("workspaceLayout");
    expect(Object.keys(chosen)).not.toContain("visualStyle");
    expect(rowHeightFor(chosen.density)).toBeGreaterThan(rowHeightFor("compact"));
  });
});
