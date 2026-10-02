/*
 * Si eres una IA, lee AGENTS.md (Agent contract) antes de tocar este archivo.
 * Machine readers start at AGENTS.md (Agent contract) and
 *   docs/adr/0010-mbon-gvs-isolated-workspaces.md.
 * Licenza: PolyForm Shield 1.0.0; vedere anche ACCEPTABLE_USE.md.
 * Le support GVS est le resultat de kjjkjjzyayufqza, fonde sur la recherche
 *   VS2 de ce projet.
 * Yazar kjjkjjzyayufqza. Urun EXVS Mod Project. Kaynak
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * Autor kjjkjjzyayufqza. Produto EXVS Mod Project. Repositorio
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { installBrowserStubs, TEST_PROVENANCE } from "../ps4-common/testHarness";
import type { GvsMemberView, GvsNode, GvsPackageView } from "./types";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/plugin-store", () => ({
  Store: { load: vi.fn(async () => Promise.reject(new Error("no store in tests"))) },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(async () => null), save: vi.fn(async () => null) }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openPath: vi.fn(async () => undefined), openUrl: vi.fn(async () => undefined) }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn(async () => undefined) }));

const WORKSPACE = "C:/mods/gvs";
const PACKAGE = `${WORKSPACE}/SYNTH002`;
const provenance = {
  ...TEST_PROVENANCE,
  researchCredit: "GVS support is kjjkjjzyayufqza's own result, derived from EXVS Mod Project's VS2 / Over Boost research.",
};
const fields = { nameHash: 0, kind: 0, reservedA: 0, link: 0, reservedB: 0 };
const root: GvsNode = {
  node: "folder",
  name: "",
  fields,
  children: [
    {
      node: "folder",
      name: "00",
      fields,
      children: [
        { node: "item", fields, file: 0 },
        { node: "item", fields, file: 1 },
      ],
    },
    { node: "item", fields, file: 2 },
  ],
};
const member = (index: number, path: string, kind: GvsMemberView["kind"], typeId: number): GvsMemberView => ({
  index,
  path,
  typeId,
  kind,
  label: kind,
  size: 128,
  exists: true,
  listings: 1,
});
const view: GvsPackageView = {
  dir: PACKAGE,
  manifest: {
    format: "exvs-gvs-package",
    version: 1,
    provenance,
    sourceName: "SYNTH002",
    sourcePath: null,
    sourceSha256: "cd".repeat(32),
    header: { version: 1, flags: 0x20000, reserved0c: 0, kind: 0x13, reserved28: 0 },
    typeOrder: [0x10, 0x20, 0x30],
    files: [
      { path: "00/body_col.nutexb", typeId: 0x10 },
      { path: "00/model.numshb", typeId: 0x20 },
      { path: "0.bscex", typeId: 0x30 },
    ],
    root,
  },
  members: [
    member(0, "00/body_col.nutexb", "nutexb", 0x10),
    member(1, "00/model.numshb", "mesh", 0x20),
    member(2, "0.bscex", "msc", 0x30),
  ],
  untracked: [],
};

beforeAll(() => {
  installBrowserStubs();
});

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (command: string) => {
    switch (command) {
      case "gvs_workspace_status":
        return [];
      case "gvs_credits":
        return provenance;
      case "gvs_list_packages":
        return [
          {
            dir: PACKAGE,
            name: "SYNTH002",
            relative: "SYNTH002",
            sourceName: "SYNTH002",
            sourcePath: null,
            fileCount: 3,
            archiveKind: 0x13,
            title: null,
          },
        ];
      case "gvs_package_view":
        return view;
      case "gvs_texture_info":
        return { name: "body_col", width: 8, height: 8, depth: 1, format: 0x80, formatLabel: "BC1 sRGB", mipCount: 1, layerCount: 1, swizzle: 0, decodable: true };
      case "gvs_texture_preview":
        return new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer;
      case "gvs_inspect":
        return { type: "other", kind: "msc", label: "MSC script", magic: "B2ACBCBA", size: 128, headHex: "B2ACBCBA" };
      case "gvs_add_folder":
        return 2;
      case "gvs_content_index":
        return {
          archivesRoot: "C:/games/CUSA08379/archives",
          available: 1,
          extracted: 0,
          items: [
            {
              hash: "DFD38C70",
              title: "Character List",
              group: "lists",
              route: "012list",
              name: "character_list",
              relativeDir: "012list/character_list",
              nameSource: "vs2-meta",
              sourcePath: "C:/games/CUSA08379/archives/DF/DFD38C70.bin",
              size: 4096,
              modifiedMs: 0,
              packages: [],
            },
          ],
        };
      default:
        throw new Error(`unexpected command ${command}`);
    }
  });
});

async function renderPage() {
  const { default: GvsWorkspacePage } = await import("./GvsWorkspacePage");
  const { useGvsStore } = await import("./store");
  useGvsStore.setState({ workspace: WORKSPACE, packageDir: PACKAGE, selection: null, verify: null });
  render(
    <MemoryRouter>
      <GvsWorkspacePage />
    </MemoryRouter>,
  );
  await screen.findByText("body_col.nutexb");
}

describe("GVS workspace page", () => {
  it("shows the expanded archive structure with credits", async () => {
    await renderPage();
    expect(screen.getByText("GVS")).toBeInTheDocument();
    expect(screen.getByText(/VS2 \/ Over Boost/)).toBeInTheDocument();
    expect(screen.getByText("00")).toBeInTheDocument();
    expect(screen.getByText("model.numshb")).toBeInTheDocument();
    expect(screen.getByText("0.bscex")).toBeInTheDocument();
  });

  it("opens a nutexb item in the texture editor", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("body_col.nutexb"));
    expect(await screen.findByText("BC1 sRGB (0x80)")).toBeInTheDocument();
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("gvs_texture_preview", { path: `${PACKAGE}/00/body_col.nutexb`, maxSide: 1024 }),
    );
  });

  it("describes other members on the info tab", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("0.bscex"));
    expect(await screen.findByText("MSC script")).toBeInTheDocument();
    expect(screen.getByText("0x00000030")).toBeInTheDocument();
  });

  it("titles the page as the GVS workspace and indexes known content without scanning", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Gundam Versus workspace" })).toBeInTheDocument();
    expect(screen.queryByText("Game files")).not.toBeInTheDocument();
    const { useGvsStore } = await import("./store");
    useGvsStore.setState({ sourceRoot: "C:/games/CUSA08379" });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Known content" }));
    expect(await screen.findByText("Character List")).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith("gvs_content_index", { sourceRoot: "C:/games/CUSA08379", workspace: WORKSPACE });
    expect(screen.getByText("Lists")).toBeInTheDocument();
    const commands = invokeMock.mock.calls.map((call) => call[0] as string);
    expect(commands.some((command) => command.includes("scan"))).toBe(false);
  });

  it("adds a folder under the selected folder", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("00"));
    fireEvent.click(screen.getByRole("button", { name: /add folder/i }));
    const input = await screen.findByLabelText("Name");
    fireEvent.change(input, { target: { value: "custom" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("gvs_add_folder", { package: PACKAGE, parentPath: [0], name: "custom" }),
    );
  });
});
