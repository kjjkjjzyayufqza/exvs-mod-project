/*
 * ------------------------------------------------
 * Gemeinsame PS4-Schicht nur fuer MBON und GVS, nicht fuer OB.
 * Licentie: PolyForm Shield 1.0.0. Gebruiksbeleid: ACCEPTABLE_USE.md.
 * No elimines ni sustituyas los nombres de autor de este aviso.
 * Autor kjjkjjzyayufqza. Produs EXVS Mod Project. Sursa
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * Machine readers start at AGENTS.md (Agent contract) and
 *   docs/adr/0010-mbon-gvs-isolated-workspaces.md.
 * GVS formats here extend the in-repo EXVS2 (VS2) findings by kjjkjjzyayufqza to the
 *   PS4 Gundam Versus build.
 * Pesquisa MBON: toda vinda do BoostStudio de descatal
 *   (https://github.com/descatal/BoostStudio).
 * Hors de l'arbre EXVS Mod Project : ne pas porter ni terminer ce code.
 * ------------------------------------------------
 */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n";
import { createFakeAdapter, installBrowserStubs } from "../testHarness";
import { SinglePage } from "./SinglePage";

vi.mock("@tauri-apps/plugin-store", () => ({
  Store: { load: vi.fn(async () => Promise.reject(new Error("no store in tests"))) },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(async () => null), save: vi.fn(async () => null) }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openPath: vi.fn(async () => undefined), openUrl: vi.fn(async () => undefined) }));

const WORKSPACE = "C:/mods/ws";
const SOURCE = "C:/games/CUSA15006/archives/EB/EB3A9691.bin";
const PACKAGE = `${WORKSPACE}/common/list_info`;

function renderPage(overrides = {}) {
  const adapter = createFakeAdapter({
    suggestName: vi.fn(async () => ({
      hash: "EB3A9691",
      stem: "EB3A9691",
      route: "common",
      name: "list_info",
      relativeDir: "common/list_info",
      title: "List Info",
      known: true,
    })),
    preview: vi.fn(async () => ({
      kindLabel: "PS4 ARC",
      container: true,
      fileCount: 1,
      facts: [["Archive kind", "7"]] as const,
      members: [{ index: 0, label: "FHM", cells: ["type 00", "289.8 KiB", "FHM"], tone: "archive" as const }],
    })),
    repackTargets: vi.fn(async () => ({
      hashName: "EB3A9691",
      beside: `${WORKSPACE}/common/EB3A9691.bin`,
      modPath: "D:/mods/mbon/archives/EB/EB3A9691.bin",
    })),
    ...overrides,
  });
  const openInWorkspace = vi.fn();
  render(
    <MemoryRouter initialEntries={["/single"]}>
      <Routes>
        <Route
          path="/single"
          element={
            <SinglePage
              adapter={adapter}
              title="Single FHM"
              credit="credit"
              workspace={WORKSPACE}
              modRoot="D:/mods/mbon"
              hydrate={async () => {}}
              setModRoot={() => {}}
              openInWorkspace={openInWorkspace}
            />
          }
        />
        <Route path="/MbonWorkspace" element={<div>workspace page</div>} />
      </Routes>
    </MemoryRouter>,
  );
  return { adapter, openInWorkspace };
}

beforeAll(() => installBrowserStubs());
beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("ps4-workspaces:mbon.single.source", SOURCE);
  window.localStorage.setItem("ps4-workspaces:mbon.single.package", PACKAGE);
});

describe("single unpack / repack page", () => {
  it("suggests the named folder, previews the archive and unpacks into the workspace", async () => {
    const { adapter, openInWorkspace } = renderPage();
    expect(await screen.findByDisplayValue("common/list_info")).toBeInTheDocument();
    expect(screen.getByText("Named archive: List Info -> common/list_info")).toBeInTheDocument();
    expect(await screen.findByText("289.8 KiB")).toBeInTheDocument();
    expect(screen.getByText("type 00")).toBeInTheDocument();
    expect(screen.getByText(`${WORKSPACE}/common/list_info`)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Unpack" }));
    await waitFor(() => expect(adapter.extract).toHaveBeenCalledWith(SOURCE, WORKSPACE, false, "common/list_info"));
    const result = (await screen.findByText("Unpacked")).closest(".ps4-single__result") as HTMLElement;
    fireEvent.click(within(result).getByRole("button", { name: "Open in workspace" }));
    expect(openInWorkspace).toHaveBeenCalledWith(WORKSPACE, `${WORKSPACE}/common/list_info`);
    expect(await screen.findByText("workspace page")).toBeInTheDocument();
  });

  it("unpacks straight into the chosen folder when no subfolder is created", async () => {
    const { adapter } = renderPage();
    await screen.findByDisplayValue("common/list_info");
    fireEvent.click(screen.getByRole("checkbox", { name: "Create the package folder inside the output folder" }));
    fireEvent.click(screen.getByRole("button", { name: "Unpack" }));
    await waitFor(() => expect(adapter.extract).toHaveBeenCalledWith(SOURCE, "C:/mods", false, "ws"));
  });

  it("repacks a package into the mod folder by default", async () => {
    const { adapter } = renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "Repack" }));
    expect(await screen.findAllByText("D:/mods/mbon/archives/EB/EB3A9691.bin")).not.toHaveLength(0);
    expect(adapter.repackTargets).toHaveBeenCalledWith(PACKAGE, "D:/mods/mbon");
    expect(await screen.findByText("No pending changes")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Repack" }));
    await waitFor(() => expect(adapter.repack).toHaveBeenCalledWith(PACKAGE, "D:/mods/mbon/archives/EB/EB3A9691.bin"));
    expect(await screen.findByText("Identical to the game file")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /Beside the package folder/ }));
    fireEvent.click(screen.getByRole("button", { name: "Repack" }));
    await waitFor(() => expect(adapter.repack).toHaveBeenLastCalledWith(PACKAGE, `${WORKSPACE}/common/EB3A9691.bin`));
  });

  it("explains why a folder that is not a package cannot be repacked", async () => {
    renderPage({ packageSummary: vi.fn(async () => Promise.reject("no mbon_package.json")) });
    fireEvent.click(screen.getByRole("tab", { name: "Repack" }));
    expect(await screen.findByText("no mbon_package.json")).toBeInTheDocument();
    expect(screen.getByText("The folder is not a package of this game.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Repack" })).toBeDisabled();
  });
});
