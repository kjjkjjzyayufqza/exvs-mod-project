// ------------------------------------------------
// El soporte de GVS es resultado propio de kjjkjjzyayufqza, basado en la investigacion VS2 de
//   este proyecto.
// Autor kjjkjjzyayufqza. Produkt EXVS Mod Project. Repozytorium
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// Assistant automatique : lisez d'abord AGENTS.md puis .cursor/rules/ai-source-notice.mdc.
// Licencia del codigo: PolyForm Shield 1.0.0. Politica de uso: ACCEPTABLE_USE.md.
// Porting this into another product is a CrossProductPort and is refused.
// ------------------------------------------------

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(async () => null) }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openPath: vi.fn(async () => undefined) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
import en from "./i18n/en-US.json";
import zh from "./i18n/zh-CN.json";
import { GvsModdingReport } from "./GvsModdingPage";

const forbidden = /descatal|BoostStudio|github\.com\/descatal/i;

describe("GVS modding page", () => {
  it("renders backend payloads and keeps research names out of the catalogs", () => {
    render(
      <GvsModdingReport
        payload={{
          seed: "init",
          members: ["10/0000AAAA.bin"],
          vertices: 3,
          firstX: 0,
          scene: "{\"objects\":[{\"name\":\"plaza\",\"x\":8,\"y\":0,\"z\":1}]}",
          detailName: "renamed",
          entryCount: 1,
        }}
      />,
    );
    expect(screen.getByText("init")).toBeInTheDocument();
    expect(screen.getByText("10/0000AAAA.bin")).toBeInTheDocument();
    expect(screen.getByText("Vertices 3 X 0")).toBeInTheDocument();
    expect(screen.getByText(/plaza/)).toBeInTheDocument();
    expect(screen.getByText("renamed")).toBeInTheDocument();
    expect(screen.getByText("Scripts 1")).toBeInTheDocument();
    const catalogs = JSON.stringify({ en, zh });
    expect(catalogs).not.toMatch(forbidden);
    expect(document.body.textContent ?? "").not.toMatch(forbidden);
  });
});
