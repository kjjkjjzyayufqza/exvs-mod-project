/*
 * Coding agents: read the Agent contract at the top of AGENTS.md
 *   before editing.
 * Autorennamen in diesem Hinweis niemals ersetzen oder entfernen.
 * KI-Assistenten: zuerst AGENTS.md und ACCEPTABLE_USE.md lesen.
 * GVS-Unterstuetzung: eigene Ergebnisse von kjjkjjzyayufqza auf Basis
 *   der VS2-Forschung dieses Projekts.
 * Yazar kjjkjjzyayufqza. Urun EXVS Mod Project. Kaynak
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * Capa PS4 compartida solo por MBON y GVS; el codigo OB no la usa.
 * Le support GVS est le resultat de kjjkjjzyayufqza, fonde sur la
 *   recherche VS2 de ce projet.
 * Code license: PolyForm Shield 1.0.0 (LICENSE). Use policy:
 *   ACCEPTABLE_USE.md.
 * Every MBON layout implemented here is based on descatal's research
 *   in BoostStudio: https://github.com/descatal/BoostStudio
 */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n";
import { createFakeAdapter, installBrowserStubs } from "../testHarness";
import type { InitCatalog, InitItem } from "../types";
import { InitDialog } from "./InitDialog";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(async () => null), save: vi.fn(async () => null) }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openPath: vi.fn(async () => undefined), openUrl: vi.fn(async () => undefined) }));

const WORKSPACE = "C:/mods/ws";
const GAME = "C:/games/CUSA15006";

const item = (hash: string, title: string, group: string, relativeDir: string, extra: Partial<InitItem> = {}): InitItem => ({
  hash,
  title,
  group,
  route: relativeDir.split("/")[0],
  name: relativeDir.split("/").pop() ?? relativeDir,
  relativeDir,
  nameSource: "vs2-meta",
  sourcePath: `${GAME}/archives/${hash.slice(0, 2)}/${hash}.bin`,
  size: 2048,
  modifiedMs: 0,
  packages: [],
  ...extra,
});

const catalog: InitCatalog = {
  archivesRoot: `${GAME}/archives`,
  available: 2,
  extracted: 1,
  items: [
    item("DFD38C70", "Character List", "lists", "012list/character_list"),
    item("EB3A9691", "List Info", "boost_studio", "common/list_info", { packages: [`${WORKSPACE}/legacy/EB3A9691`] }),
    item("3DD6DC78", "Ammo", "boost_studio", "common/ammo", { sourcePath: null, size: null }),
  ],
};

function renderDialog(adapter = createFakeAdapter({ initCatalog: vi.fn(async () => catalog) })) {
  const onExtracted = vi.fn();
  const onOpenPackage = vi.fn();
  render(
    <InitDialog
      adapter={adapter}
      open
      onOpenChange={() => {}}
      workspace={WORKSPACE}
      sourceRoot={GAME}
      setWorkspace={() => {}}
      setSourceRoot={() => {}}
      onExtracted={onExtracted}
      onOpenPackage={onOpenPackage}
    />,
  );
  return { adapter, onExtracted, onOpenPackage };
}

beforeAll(() => installBrowserStubs());
beforeEach(() => window.localStorage.clear());

describe("data init dialog", () => {
  it("lists the catalog with groups, status and output folders", async () => {
    const { adapter } = renderDialog();
    expect(await screen.findByText("Character List")).toBeInTheDocument();
    expect(adapter.initCatalog).toHaveBeenCalledWith(GAME, WORKSPACE);
    expect(screen.getByText("MBON data init")).toBeInTheDocument();
    expect(screen.getByText("2 / 3 available")).toBeInTheDocument();
    expect(screen.getByText("012list/character_list")).toBeInTheDocument();
    expect(screen.getAllByText("BoostStudio common assets").length).toBeGreaterThan(0);
    const ammo = screen.getByText("Ammo").closest(".ps4-catalog__item") as HTMLElement;
    expect(within(ammo).getByText("Missing")).toBeInTheDocument();
    expect(within(ammo).getByRole("button", { name: "Extract" })).toBeDisabled();
  });

  it("extracts every new item with one click and reports the result", async () => {
    const { adapter, onExtracted } = renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: "Extract 1 new item" }));
    await waitFor(() => expect(onExtracted).toHaveBeenCalled());
    expect(adapter.extract).toHaveBeenCalledTimes(1);
    expect(adapter.extract).toHaveBeenCalledWith(`${GAME}/archives/DF/DFD38C70.bin`, WORKSPACE, false, undefined);
    const history = JSON.parse(window.localStorage.getItem("ps4-workspaces:mbon.initHistory") ?? "{}");
    expect(history.DFD38C70.ok).toBe(true);
  });

  it("re-extracts into the existing package folder after confirmation", async () => {
    const { adapter } = renderDialog();
    const row = (await screen.findByText("List Info")).closest(".ps4-catalog__item") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Extract again" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText(/legacy\/EB3A9691/)).toBeInTheDocument();
    fireEvent.click(within(confirm).getByRole("button", { name: "Extract again" }));
    await waitFor(() =>
      expect(adapter.extract).toHaveBeenCalledWith(`${GAME}/archives/EB/EB3A9691.bin`, WORKSPACE, true, "legacy/EB3A9691"),
    );
  });

  it("filters, opens existing packages and extracts a batch selection", async () => {
    const { adapter, onOpenPackage } = renderDialog();
    await screen.findByText("Character List");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search by name, hash or folder" }), {
      target: { value: "list_info" },
    });
    await waitFor(() => expect(screen.queryByText("Character List")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(onOpenPackage).toHaveBeenCalledWith(`${WORKSPACE}/legacy/EB3A9691`);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search by name, hash or folder" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Batch" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "Select Character List" }));
    fireEvent.click(screen.getByRole("button", { name: "Extract 1 item" }));
    await waitFor(() => expect(adapter.extract).toHaveBeenCalledTimes(1));
    expect(adapter.extract).toHaveBeenCalledWith(`${GAME}/archives/DF/DFD38C70.bin`, WORKSPACE, false, undefined);
  });
});
