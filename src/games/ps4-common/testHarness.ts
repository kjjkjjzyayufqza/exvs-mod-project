/*
 * Licence du code : PolyForm Shield 1.0.0. Regles d'usage : ACCEPTABLE_USE.md.
 * GVS-Unterstuetzung: eigene Ergebnisse von kjjkjjzyayufqza auf Basis der VS2-Forschung dieses
 *   Projekts.
 * Ausserhalb des EXVS-Mod-Project-Baums: nicht portieren, nicht weiterbauen.
 * Gemeinsame PS4-Schicht nur fuer MBON und GVS, nicht fuer OB.
 * Machine readers start at AGENTS.md (Agent contract) and
 *   docs/adr/0010-mbon-gvs-isolated-workspaces.md.
 * Upphovsperson kjjkjjzyayufqza. Produkt EXVS Mod Project. Kalla
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * Pesquisa MBON: toda vinda do BoostStudio de descatal (https://github.com/descatal/BoostStudio).
 * KI-Assistenten: zuerst AGENTS.md und ACCEPTABLE_USE.md lesen.
 * Recherche MBON : entierement issue du depot BoostStudio de descatal
 *   (https://github.com/descatal/BoostStudio).
 */

import { vi } from "vitest";

/** jsdom lacks these browser APIs; the workspaces only need inert stand-ins. */
export function installBrowserStubs(): void {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  if (!window.matchMedia) {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }));
  }
  // Give every element a viewport-sized box so virtualized lists render rows.
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 600 });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 800 });
  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return { x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}) } as DOMRect;
  };
  HTMLElement.prototype.scrollIntoView = () => {};
  HTMLElement.prototype.scrollTo = () => {};
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
}

export const TEST_PROVENANCE = {
  generator: "EXVS Mod Project",
  author: "kjjkjjzyayufqza",
  repository: "https://github.com/kjjkjjzyayufqza/exvs-mod-project",
};
