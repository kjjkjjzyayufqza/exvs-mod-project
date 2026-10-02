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
import { MemoryRouter } from "react-router-dom";
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

const contentIndex = {
  archivesRoot: "C:/games/CUSA15006/archives",
  available: 2,
  extracted: 1,
  items: [
    {
      hash: "EB3A9691",
      title: "List Info",
      group: "boost_studio",
      route: "common",
      name: "list_info",
      relativeDir: "common/list_info",
      nameSource: "boost-studio",
      sourcePath: "C:/games/CUSA15006/archives/EB/EB3A9691.bin",
      size: 362292,
      modifiedMs: 0,
      packages: [`${WORKSPACE}/common/list_info`],
    },
    {
      hash: "0A1B2C3D",
      title: "unit_rx78",
      group: "",
      route: "unit",
      name: "unit_rx78",
      relativeDir: "unit/unit_rx78",
      nameSource: "scharacterlist",
      sourcePath: "C:/games/CUSA15006/archives/0A/0A1B2C3D.bin",
      size: 2048,
      modifiedMs: 0,
      packages: [],
    },
    {
      hash: "3DD6DC78",
      title: "Ammo",
      group: "boost_studio",
      route: "common",
      name: "ammo",
      relativeDir: "common/ammo",
      nameSource: "boost-studio",
      sourcePath: null,
      size: null,
      modifiedMs: null,
      packages: [],
    },
  ],
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
      case "mbon_workspace_status":
        return [
          {
            dir: PACKAGE,
            relative: "SYNTH001",
            sourceName: "SYNTH001",
            hasBaseline: true,
            dirty: true,
            manifestChanged: false,
            changeCount: 1,
            sample: ["0000.fhm/001.nut"],
            error: null,
          },
        ];
      case "mbon_init_catalog":
        return {
          archivesRoot: "C:/games/CUSA15006/archives",
          available: 1,
          extracted: 0,
          items: [
            {
              hash: "EB3A9691",
              title: "List Info",
              group: "boost_studio",
              route: "common",
              name: "list_info",
              relativeDir: "common/list_info",
              nameSource: "boost-studio",
              sourcePath: "C:/games/CUSA15006/archives/EB/EB3A9691.bin",
              size: 362292,
              modifiedMs: 0,
              packages: [],
            },
          ],
        };
      case "mbon_content_index":
        return contentIndex;
      case "mbon_extract":
        return { packageDir: `${WORKSPACE}/unit/unit_rx78`, payloadCount: 1, entryCount: 4, filesWritten: 5, bytesWritten: 4096 };
      case "mbon_credits":
        return provenance;
      case "mbon_list_packages":
        return [
          {
            dir: PACKAGE,
            name: "SYNTH001",
            relative: "SYNTH001",
            sourceName: "SYNTH001",
            sourcePath: null,
            payloadCount: 1,
            container: true,
            title: null,
          },
        ];
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
  render(
    <MemoryRouter>
      <MbonWorkspacePage />
    </MemoryRouter>,
  );
  await screen.findByText("001.nut");
}

describe("MBON workspace page", () => {
  it("shows credits, packages and the FHM entries of the open package", async () => {
    await renderPage();
    expect(screen.getByText("MBON")).toBeInTheDocument();
    expect(screen.getByText(/kjjkjjzyayufqza/)).toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toMatch(/descatal|BoostStudio|github\.com\/descatal/);
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

  it("shows pending changes and opens data init with the MBON catalog", async () => {
    await renderPage();
    expect(await screen.findByText("1 pending change")).toBeInTheDocument();
    const repack = screen.getByRole("button", { name: /^Repack changes/ });
    expect(within(repack).getByLabelText("1 package with pending changes")).toBeInTheDocument();
    const { useMbonStore } = await import("./store");
    useMbonStore.setState({ sourceRoot: "C:/games/CUSA15006" });
    fireEvent.click(screen.getAllByRole("button", { name: "Data init" })[0]);
    expect(await screen.findByText("List Info")).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith("mbon_init_catalog", {
      sourceRoot: "C:/games/CUSA15006",
      workspace: WORKSPACE,
    });
    expect(screen.getByText("common/list_info")).toBeInTheDocument();
  });

  it("verifies the rebuild and reports it in the info panel", async () => {
    await renderPage();
    const info = document.getElementById("ps4-mbon-info-content") as HTMLElement;
    expect(within(info).getByText("Not verified")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /verify/i }));
    expect(await within(info).findByText(/^Identical \(/)).toBeInTheDocument();
  });

  it("titles the page as the MBON workspace in the EXVS2 Workspace layout", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Maxi Boost ON workspace" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Structure" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tree", { name: "Workspace packages" })).toBeInTheDocument();
    expect(screen.queryByText("Game files")).not.toBeInTheDocument();
  });

  it("indexes known content from the lists and extracts by hash, never scanning", async () => {
    await renderPage();
    const { useMbonStore } = await import("./store");
    useMbonStore.setState({ sourceRoot: "C:/games/CUSA15006" });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Known content" }));
    const unit = await screen.findByText("unit_rx78");
    expect(invokeMock).toHaveBeenCalledWith("mbon_content_index", { sourceRoot: "C:/games/CUSA15006", workspace: WORKSPACE });
    expect(screen.getByText("Units from SCharacterList")).toBeInTheDocument();
    expect(screen.getByText("3 known archives")).toBeInTheDocument();

    const ammo = screen.getByText("Ammo").closest("[role=option]") as HTMLElement;
    expect(within(ammo).getByText("Missing")).toBeInTheDocument();
    expect(within(ammo).getByRole("button", { name: "Extract" })).toBeDisabled();

    const row = unit.closest("[role=option]") as HTMLElement;
    fireEvent.click(row);
    const info = document.getElementById("ps4-mbon-info-content") as HTMLElement;
    expect(within(info).getByText("SCharacterList")).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: "Extract" }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("mbon_extract", {
        source: "C:/games/CUSA15006/archives/0A/0A1B2C3D.bin",
        workspace: WORKSPACE,
        overwrite: false,
        name: "unit/unit_rx78",
      }),
    );
    // The new package opens in the structure editor.
    await waitFor(() => expect(screen.getByRole("tab", { name: "Structure" })).toHaveAttribute("aria-selected", "true"));
    const commands = invokeMock.mock.calls.map((call) => call[0] as string);
    expect(commands.some((command) => command.includes("scan"))).toBe(false);
  });
});
