import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { appI18n } from "@/i18n/i18n";
import { buildGraph, importCGraph, parseGraph } from "@/services/missionGraph/graph";
import { MISSION_C_TEMPLATE } from "@/services/missionTranspiler/template";
import { modelFromC } from "@/services/missionTranspiler/transpile";
import type { GraphRequest } from "@/services/missionGraph/workerClient";
import { installFlowGeometry } from "./flowTestGeometry";
import { useConfigStore } from "@/store/configStore";

// UI smoke coverage only. source.test.ts and mission_authoring_test.rs exercise
// the real parser, disk files, native saver and compiler for the file contract.
const io = vi.hoisted(() => ({ invoke: vi.fn(), save: vi.fn(), open: vi.fn(), confirm: vi.fn(), writeFile: vi.fn(), writeTextFile: vi.fn(), readTextFile: vi.fn(), stat: vi.fn(), exists: vi.fn(), writeClipboard: vi.fn(), readClipboard: vi.fn() }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: io.writeClipboard, readText: io.readClipboard }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: io.invoke }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: io.save, open: io.open, confirm: io.confirm }));
vi.mock("@tauri-apps/plugin-fs", () => ({ writeFile: io.writeFile, writeTextFile: io.writeTextFile, readTextFile: io.readTextFile, stat: io.stat, exists: io.exists }));
vi.mock("@/services/missionGraph/workerClient", () => ({
  runGraphTask: (request: GraphRequest) => ({
    promise: Promise.resolve().then(() => request.kind === "build" ? { graph: request.graph, build: buildGraph(request.graph, request.source) } : { graph: request.kind === "json" ? parseGraph(request.source) : importCGraph(request.source) }),
    cancel: vi.fn(),
  }),
}));
vi.mock("@/services/missionGraph/workspaceCatalog", () => ({
  loadWorkspaceResourceCatalog: async () => ({ maps: [], bgm: [], units: [], messages: [] }),
  loadStageListMapOptions: async () => [],
  loadBgmListOptions: async () => [],
  loadCharacterListUnitOptions: async () => [],
  loadCachedCharacterListUnitOptions: async () => [],
}));

import MissionNodeEditorPage from "./page";
import { RouterItems } from "@/router/router";
import { SIDEBAR_ROUTE_URLS } from "@/router/sidebarRouteUrls";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { NavigationGuardProvider } from "@/layout/NavigationGuardContext";

const path = "E:/scratch/mission.c";
describe("Mission Node Editor source workflow", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    vi.stubGlobal("PointerEvent", MouseEvent);
    installFlowGeometry();
    window.localStorage.removeItem("mission-node-editor.scheme");
    await appI18n.changeLanguage("en-US");
    io.open.mockResolvedValue(path);
    io.readTextFile.mockResolvedValue(MISSION_C_TEMPLATE);
    io.exists.mockResolvedValue(false);
    io.confirm.mockResolvedValue(true);
    io.invoke.mockImplementation(async (command: string, args: { path: string; source: string }) => {
      if (command === "read_mission_source") return io.readTextFile(args.path);
      if (command === "save_mission_source") return io.writeTextFile(args.path, args.source);
      return [1, 2, 3];
    });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  async function openEditor() {
    const view = render(<MissionNodeEditorPage />);
    expect(view.container.querySelector(".react-flow")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open mission .c" }));
    await screen.findByLabelText("Player team cost");
    await waitFor(() => expect(screen.getByRole("button", { name: "Save .c" })).toBeEnabled());
    return view;
  }

  it("exposes the mission node editor in the sidebar footer", () => {
    render(<MemoryRouter initialEntries={["/MissionNodeEditor"]}><NavigationGuardProvider><SidebarProvider><AppSidebar /></SidebarProvider></NavigationGuardProvider></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Mission Node Editor" })).toHaveAttribute("data-active", "true");
    expect(RouterItems.map((item) => item.url)).toEqual(SIDEBAR_ROUTE_URLS);
  });

  it("opens source, previews without rewriting and saves through the native contract", async () => {
    await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Preview changes" }));
    const source = await screen.findByRole("textbox", { name: "Generated MSC C" });
    expect(source).toHaveValue(MISSION_C_TEMPLATE);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save .c" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Save .c" }));
    await waitFor(() => expect(io.invoke).toHaveBeenCalledWith("save_mission_source", { path, expected: MISSION_C_TEMPLATE, source: MISSION_C_TEMPLATE }));
    expect(io.save).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Compile & export MSC" })).not.toBeInTheDocument();
  });

  it("inserts a connected phase, selects its settings and supports undo/redo", async () => {
    await openEditor();
    fireEvent.click(within(screen.getByRole("complementary", { name: "Node library" })).getByRole("button", { name: "Condition + delay" }));
    expect(screen.getByRole("button", { name: "Save .c" })).toBeEnabled();
    const delay = screen.getByLabelText("Delay (seconds)");
    fireEvent.change(delay, { target: { value: "3" } });
    fireEvent.keyDown(delay, { key: "z", ctrlKey: true });
    expect(screen.getByLabelText("Delay (seconds)")).toHaveValue("1");
    fireEvent.keyDown(screen.getByLabelText("Delay (seconds)"), { key: "z", ctrlKey: true, shiftKey: true });
    expect(screen.getByLabelText("Delay (seconds)")).toHaveValue("3");
    fireEvent.keyDown(screen.getByLabelText("Delay (seconds)"), { key: "z", ctrlKey: true });
    expect(screen.getByLabelText("Delay (seconds)")).toHaveValue("1");
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    fireEvent.click(screen.getByRole("button", { name: "Save .c" }));
    await waitFor(() => expect(io.writeTextFile).toHaveBeenCalled());
    expect(modelFromC(io.writeTextFile.mock.calls[0][1]).phases.at(-1)?.delaySeconds).toBe(3);
  });

  it("saves source with Ctrl+S from a property input and retains the original snapshot", async () => {
    await openEditor();
    fireEvent.change(screen.getByLabelText("Player team cost"), { target: { value: "6500" } });
    fireEvent.keyDown(screen.getByLabelText("Player team cost"), { key: "s", ctrlKey: true });
    await waitFor(() => expect(io.writeTextFile).toHaveBeenCalledTimes(1));
    expect(modelFromC(io.writeTextFile.mock.calls[0][1]).battle.teamCosts[0].cost).toBe(6500);
    expect(io.invoke).toHaveBeenCalledWith("save_mission_source", expect.objectContaining({ path, expected: MISSION_C_TEMPLATE }));
  });

  it("keeps canvas layout out of source saves and retains the minimap", async () => {
    const { container } = await openEditor();
    const start = await screen.findByRole("group", { name: "Select Mission start" });
    fireEvent.click(start);
    fireEvent.keyDown(start, { key: "ArrowRight" });
    expect(container.querySelector(".react-flow__minimap")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Toggle minimap" }));
    expect(container.querySelector(".react-flow__minimap")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save .c" }));
    await waitFor(() => expect(io.writeTextFile).toHaveBeenCalledWith(path, MISSION_C_TEMPLATE));
  });

  it("edits coordinates and reloads the saved C", async () => {
    await openEditor();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Units & points" }));
    fireEvent.change(screen.getByLabelText(/Spawn X/), { target: { value: "-4000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save .c" }));
    await waitFor(() => expect(io.writeTextFile).toHaveBeenCalled());
    const text = io.writeTextFile.mock.calls[0][1];
    expect(modelFromC(text).slots[0][34] | 0).toBe(-4000);
    await waitFor(() => expect(screen.getByRole("button", { name: "Open mission .c" })).toBeEnabled());
    io.readTextFile.mockResolvedValue(text);
    fireEvent.click(screen.getByRole("button", { name: "Open mission .c" }));
    await screen.findByLabelText("Player team cost");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Units & points" }));
    expect(screen.getByLabelText(/Spawn X/)).toHaveValue("-4000");
  });

  it("retains clipboard drafts and restores the flow in one undo", async () => {
    await openEditor();
    const canvas = screen.getByLabelText("Mission graph canvas");
    fireEvent.click(await screen.findByRole("group", { name: "Select Phase 1" }));
    fireEvent.keyDown(canvas, { key: "c", ctrlKey: true });
    await waitFor(() => expect(io.writeClipboard).toHaveBeenCalled());
    io.readClipboard.mockResolvedValue(io.writeClipboard.mock.calls[0][0]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Copy selection" })).toBeEnabled());
    fireEvent.keyDown(canvas, { key: "v", ctrlKey: true });
    await waitFor(() => expect(screen.getByRole("button", { name: "Duplicate selection" })).toBeEnabled());
    expect(screen.getByRole("button", { name: "Save .c" })).toBeDisabled();
    fireEvent.keyDown(canvas, { key: "z", ctrlKey: true });
    expect(screen.getByRole("button", { name: "Save .c" })).toBeEnabled();
  });

  it("removes duplicate navigation and non-compiling library entries", async () => {
    await openEditor();
    expect(screen.queryByRole("button", { name: /^Mission$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Units$/ })).not.toBeInTheDocument();
    const library = within(screen.getByRole("complementary", { name: "Node library" }));
    expect(library.queryByRole("button", { name: /TODO/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Message + deploy wave" }));
    expect(screen.getByRole("button", { name: "Save .c" })).toBeEnabled();
  });

  it("keeps edits on unsupported import, cancelled replacement and a failed save", async () => {
    await openEditor();
    fireEvent.change(screen.getByLabelText("Player team cost"), { target: { value: "6500" } });
    fireEvent.click(screen.getByRole("button", { name: "Open mission .c" }));
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "Stay" }));
    expect(io.open).toHaveBeenCalledTimes(1);
    io.readTextFile.mockResolvedValue("void broken() {");
    fireEvent.click(screen.getByRole("button", { name: "Open mission .c" }));
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Player team cost")).toHaveValue("6500");
    io.invoke.mockRejectedValue("Mission source changed outside the editor");
    fireEvent.click(screen.getByRole("button", { name: "Save .c" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("changed outside");
    expect(screen.getByLabelText("Player team cost")).toHaveValue("6500");
    expect(io.writeTextFile).not.toHaveBeenCalled();
  });

  it("saves the .c, assembles the .mismsexc, then packs the fhm2d", async () => {
    useConfigStore.setState({ obModPath: "E:/mod" });
    io.exists.mockImplementation(async (candidate: string) =>
      candidate.replaceAll("/", "\\").toLowerCase() === "e:\\scratch_structure.json",
    );
    io.invoke.mockImplementation(async (command: string, args: { path?: string; source?: string }) => {
      if (command === "read_mission_source") return io.readTextFile(args.path);
      if (command === "save_mission_source") return io.writeTextFile(args.path, args.source);
      if (command === "repack_fhm2d") {
        return { outputPath: "E:\\mod\\scratch.fhm2d", totalFiles: 1, outputSize: 3 };
      }
      return [1, 2, 3];
    });
    await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Pack FHM2D" }));
    await screen.findByText(/scratch\.fhm2d/);
    expect(io.writeTextFile).toHaveBeenCalledWith(path, MISSION_C_TEMPLATE);
    expect(io.writeFile).toHaveBeenCalledWith(
      "E:\\scratch\\mission.mismsexc",
      new Uint8Array([1, 2, 3]),
    );
    expect(io.invoke).toHaveBeenCalledWith("repack_fhm2d", {
      structureJsonPath: "E:\\scratch_structure.json",
      outputPath: "E:\\mod\\scratch.fhm2d",
      atomicWrite: true,
    });
  });

  it("validates natively and changes the active path after Save as", async () => {
    await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    await screen.findByText(/Source compiled; coroutine addresses/);
    expect(io.invoke).toHaveBeenCalledWith("compile_mission_authoring", { source: MISSION_C_TEMPLATE });
    io.save.mockResolvedValue("E:/scratch/copy.c");
    fireEvent.click(screen.getByRole("button", { name: "Save as…" }));
    await screen.findByText(/copy\.c · Saved/);
    fireEvent.click(screen.getByRole("button", { name: "Save .c" }));
    await waitFor(() => expect(io.invoke).toHaveBeenCalledWith("save_mission_source", { path: "E:/scratch/copy.c", source: MISSION_C_TEMPLATE, expected: MISSION_C_TEMPLATE }));
  });

  it("opens the problems dock when validate is clicked while the dock is collapsed", async () => {
    const view = await openEditor();
    const stage = view.container.querySelector(".mission-stage")!;
    fireEvent.click(screen.getByRole("button", { name: "Collapse bottom panel" }));
    expect(stage).toHaveAttribute("data-dock", "off");
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    await waitFor(() => expect(stage).toHaveAttribute("data-dock", "on"));
  });

  it("collapses and expands the actions panel from the panel chrome", async () => {
    await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Collapse actions panel" }));
    expect(screen.queryByRole("button", { name: "Collapse actions panel" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand actions panel" }));
    expect(screen.getByRole("button", { name: "Collapse actions panel" })).toBeInTheDocument();
  });
});
