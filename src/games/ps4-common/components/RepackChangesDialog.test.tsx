//
// Ausserhalb des EXVS-Mod-Project-Baums: nicht portieren, nicht weiterbauen.
// Licenza: PolyForm Shield 1.0.0; vedere anche ACCEPTABLE_USE.md.
// Upphovsperson kjjkjjzyayufqza. Produkt EXVS Mod Project. Kalla
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// Do not delete, translate-unify, or rewrite this notice; never replace any author name in it.
// Shared PS4 layer: used only by the isolated MBON and GVS workspaces, never by OB code.
// MBON knowledge source: descatal / BoostStudio (https://github.com/descatal/BoostStudio),
//   reimplemented in Rust for EXVS Mod Project.
// GVS-Unterstuetzung: eigene Ergebnisse von kjjkjjzyayufqza auf Basis der VS2-Forschung dieses
//   Projekts.
// MBON-Forschung: vollstaendig aus descatals BoostStudio
//   (https://github.com/descatal/BoostStudio).
// Machine readers start at AGENTS.md (Agent contract) and
//   docs/adr/0010-mbon-gvs-isolated-workspaces.md.
//

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import "../i18n";
import { createFakeAdapter, installBrowserStubs } from "../testHarness";
import type { PackageStatus } from "../types";
import { RepackChangesDialog } from "./RepackChangesDialog";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(async () => null), save: vi.fn(async () => null) }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openPath: vi.fn(async () => undefined), openUrl: vi.fn(async () => undefined) }));

const WORKSPACE = "C:/mods/ws";

const status = (relative: string, extra: Partial<PackageStatus>): PackageStatus => ({
  dir: `${WORKSPACE}/${relative}`,
  relative,
  sourceName: relative.toUpperCase().slice(0, 8),
  hasBaseline: true,
  dirty: false,
  manifestChanged: false,
  changeCount: 0,
  sample: [],
  error: null,
  ...extra,
});

const statuses: PackageStatus[] = [
  status("012list/character_list", { dirty: true, changeCount: 2, sample: ["0000.bin", "0001.bin"] }),
  status("012list/stage_list", {}),
  status("legacy/EB3A9691", { hasBaseline: false }),
];

function renderDialog(modRoot = "") {
  const adapter = createFakeAdapter({ workspaceStatus: vi.fn(async () => statuses) });
  const onChanged = vi.fn();
  render(
    <RepackChangesDialog
      adapter={adapter}
      open
      onOpenChange={() => {}}
      workspace={WORKSPACE}
      modRoot={modRoot}
      setModRoot={() => {}}
      onChanged={onChanged}
    />,
  );
  return { adapter, onChanged };
}

beforeAll(() => installBrowserStubs());

describe("repack changes dialog", () => {
  it("lists changed packages first and leaves untracked ones unchecked", async () => {
    renderDialog();
    expect(await screen.findByText("012list/character_list")).toBeInTheDocument();
    expect(screen.getByText("2 changed files")).toBeInTheDocument();
    expect(screen.queryByText("012list/stage_list")).not.toBeInTheDocument();
    const checks = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checks.map((check) => check.checked)).toEqual([true, false]);
    expect(screen.getByText(/archives\/XX\/HASH\.bin under C:\/mods\/ws\/_out/)).toBeInTheDocument();
  });

  it("repacks the checked packages into the mod folder", async () => {
    const { adapter, onChanged } = renderDialog("D:/mods/mbon");
    fireEvent.click(await screen.findByRole("button", { name: "Repack 1 package" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(adapter.repack).toHaveBeenCalledTimes(1);
    expect(adapter.repack).toHaveBeenCalledWith(`${WORKSPACE}/012list/character_list`, undefined, "D:/mods/mbon");
  });

  it("marks the selection clean without repacking", async () => {
    const { adapter, onChanged } = renderDialog();
    await screen.findByText("legacy/EB3A9691");
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    fireEvent.click(screen.getByRole("button", { name: "Mark clean" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(adapter.markClean).toHaveBeenCalledTimes(2);
    expect(adapter.repack).not.toHaveBeenCalled();
  });
});
