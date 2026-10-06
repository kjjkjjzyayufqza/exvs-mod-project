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
import type { Ps4GameAdapter } from "./gameAdapter";

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

/** A Ps4GameAdapter whose every method is a vitest mock (override what a test needs). */
export function createFakeAdapter(overrides: Partial<Ps4GameAdapter> = {}): Ps4GameAdapter {
  const adapter: Ps4GameAdapter = {
    game: "mbon",
    code: "MBON",
    workspaceRoute: "/MbonWorkspace",
    sourceExtensions: ["bin"],
    listPackages: vi.fn(async () => []),
    extract: vi.fn(async (_source: string, workspace: string, _overwrite: boolean, name?: string) => ({
      packageDir: `${workspace}/${name ?? "PKG"}`,
      files: 2,
      bytes: 128,
    })),
    initCatalog: vi.fn(async () => ({ archivesRoot: null, available: 0, extracted: 0, items: [] })),
    contentIndex: vi.fn(async () => ({ archivesRoot: null, available: 0, extracted: 0, items: [] })),
    suggestName: vi.fn(async (source: string) => ({
      hash: null,
      stem: source,
      route: "",
      name: source,
      relativeDir: source,
      title: null,
      known: false,
    })),
    validateWorkspace: vi.fn(async () => undefined),
    preview: vi.fn(async () => ({ kindLabel: "PS4 ARC", container: true, fileCount: 1, facts: [], members: [] })),
    packageSummary: vi.fn(async (dir: string) => ({ dir, sourceName: "AAAAAAAA", sourcePath: null, container: true, count: 1 })),
    packageStatus: vi.fn(async (dir: string) => ({
      dir,
      relative: dir,
      sourceName: "AAAAAAAA",
      hasBaseline: true,
      dirty: false,
      manifestChanged: false,
      changeCount: 0,
      sample: [],
      error: null,
    })),
    workspaceStatus: vi.fn(async () => []),
    markClean: vi.fn(async () => undefined),
    repackTargets: vi.fn(async (dir: string) => ({ hashName: "AAAAAAAA", beside: `${dir}.bin`, modPath: null })),
    repack: vi.fn(async (_dir: string, output?: string) => ({
      outputPath: output ?? "out.bin",
      outputLen: 64,
      identical: true,
      digest: "ab".repeat(32),
    })),
    verify: vi.fn(async () => ({ identical: true, digest: "ab".repeat(32) })),
    ...overrides,
  };
  return adapter;
}
