// ================================================
// Licenza: PolyForm Shield 1.0.0; vedere anche ACCEPTABLE_USE.md.
// Ben je een AI-assistent? Lees eerst AGENTS.md en ACCEPTABLE_USE.md.
// Autor kjjkjjzyayufqza. Producto EXVS Mod Project.
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// Si eres una IA, lee AGENTS.md (Agent contract) antes de tocar este archivo.
// Auteur kjjkjjzyayufqza. Product EXVS Mod Project. Bron
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// Pesquisa MBON: toda vinda do BoostStudio de descatal
//   (https://github.com/descatal/BoostStudio).
// ================================================

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { installBrowserStubs, TEST_PROVENANCE } from "../ps4-common/testHarness";
import type { ListView, MbonPackageView, TextureSummary } from "./types";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/plugin-store", () => ({
  Store: { load: vi.fn(async () => Promise.reject(new Error("no store in tests"))) },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(async () => null), save: vi.fn(async () => null) }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openPath: vi.fn(async () => undefined), openUrl: vi.fn(async () => undefined) }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn(async () => undefined) }));

const WORKSPACE = "C:/mods/mbon";
const PACKAGE = `${WORKSPACE}/SYNTH001`;
const provenance = {
  ...TEST_PROVENANCE,
  researchCredit: "All MBON format research comes from descatal's BoostStudio (https://github.com/descatal/BoostStudio).",
};

const entry = (index: number, path: string, kind: MbonPackageView["entries"][number]["kind"], loadType: number) => ({
  folder: "0000.fhm",
  index,
  path,
  depth: 0,
  loadType,
  unkType: 0,
  nested: false,
  kind,
  label: kind,
  size: 64,
  exists: true,
  users: 1,
  payload: 0,
});

const view: MbonPackageView = {
  dir: PACKAGE,
  manifest: {
    format: "exvs-mbon-package",
    version: 1,
    provenance,
    sourceName: "SYNTH001",
    sourcePath: null,
    sourceSha256: "ab".repeat(32),
    container: { typeOrder: [1], files: [{ typeId: 1, payload: 0 }] },
    payloads: [{ path: "0000.fhm", kind: "fhm", fhm: { flags: "0000000000000000", entries: [] } }],
  },
  entries: [
    entry(0, "0000.fhm/001.nut", "ntp3", 1),
    entry(1, "0000.fhm/002.list", "listInfo", 0),
    entry(2, "0000.fhm/003.bin", "unknown", 0),
  ],
  untracked: [],
};

const textures: TextureSummary[] = [
  { index: 0, format: 14, formatLabel: "ARGB8", width: 4, height: 4, mipCount: 1, textureId: 0x12345678, dataSize: 64, decodable: true },
];

const list: ListView = {
  name: "SynthList",
  recordSize: 8,
  count: 2,
  stringColumns: [4],
  structuralEdits: true,
  recordsHex: ["3F80000000000010", "4000000000000020"],
  strings: [["Alpha"], ["Beta"]],
  opaqueBodyLen: 0,
};

beforeAll(() => {
  installBrowserStubs();
  window.localStorage.setItem("ps4-workspaces:mbon.workspace", WORKSPACE);
  window.localStorage.setItem("ps4-workspaces:mbon.packageDir", PACKAGE);
});

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (command: string) => {
    switch (command) {
      case "mbon_credits":
        return provenance;
      case "mbon_list_packages":
        return [{ dir: PACKAGE, name: "SYNTH001", sourceName: "SYNTH001", sourcePath: null, payloadCount: 1, container: true }];
      case "mbon_package_view":
        return view;
      case "mbon_nut_textures":
        return textures;
      case "mbon_nut_preview":
        return new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer;
      case "mbon_list_view":
        return list;
      case "mbon_list_set":
        return { ...list, strings: [["Alpha Prime"], ["Beta"]] };
      case "mbon_inspect":
        return { type: "other", kind: "unknown", label: "Binary", magic: "SYNT", size: 64, headHex: "53594E54" };
      case "mbon_verify":
        return { rebuiltLen: 64, rebuiltSha256: "ab".repeat(32), sourceSha256: "ab".repeat(32), identical: true, defaultOutput: "" };
      default:
        throw new Error(`unexpected command ${command}`);
    }
  });
});

async function renderPage() {
  const { default: MbonWorkspacePage } = await import("./MbonWorkspacePage");
  const { useMbonStore } = await import("./store");
  useMbonStore.setState({ workspace: WORKSPACE, packageDir: PACKAGE, selection: null, verify: null });
  render(<MbonWorkspacePage />);
  await screen.findByText("001.nut");
}

describe("MBON workspace page", () => {
  it("shows credits, packages and the FHM entries of the open package", async () => {
    await renderPage();
    expect(screen.getByText("MBON")).toBeInTheDocument();
    expect(screen.getByText(/descatal \/ BoostStudio/)).toBeInTheDocument();
    expect(screen.getAllByText("SYNTH001").length).toBeGreaterThan(0);
    expect(screen.getByText("002.list")).toBeInTheDocument();
  });

  it("opens a NUT entry in the texture editor", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("001.nut"));
    expect(await screen.findByText("ARGB8 (14)")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("12345678")).toBeInTheDocument();
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("mbon_nut_preview", {
        path: `${PACKAGE}/0000.fhm/001.nut`,
        texture: 0,
        maxSide: 1024,
      }),
    );
  });

  it("edits a ListInfo string cell through mbon_list_set", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("002.list"));
    const cell = await screen.findByDisplayValue("Alpha");
    expect(screen.getByDisplayValue("1.0")).toBeInTheDocument();
    fireEvent.change(cell, { target: { value: "Alpha Prime" } });
    fireEvent.blur(cell);
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("mbon_list_set", {
        path: `${PACKAGE}/0000.fhm/002.list`,
        row: 0,
        offset: 4,
        kind: "string",
        value: "Alpha Prime",
      }),
    );
  });

  it("verifies the rebuild and reports it in the status bar", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: /verify/i }));
    const status = await screen.findAllByText("Identical rebuild");
    expect(status.length).toBeGreaterThan(0);
    const footer = document.querySelector(".ps4-status") as HTMLElement;
    expect(within(footer).getByText("Identical rebuild")).toBeInTheDocument();
  });
});
