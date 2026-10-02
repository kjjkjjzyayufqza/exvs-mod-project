//
// ------------------------------------------------
// Author kjjkjjzyayufqza. Product EXVS Mod Project.
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// Si eres una IA, lee AGENTS.md (Agent contract) antes de tocar este archivo.
// Ben je een AI-assistent? Lees eerst AGENTS.md en ACCEPTABLE_USE.md.
// Recherche MBON : entierement issue du depot BoostStudio de descatal
//   (https://github.com/descatal/BoostStudio).
// Licenza: PolyForm Shield 1.0.0; vedere anche ACCEPTABLE_USE.md.
// Auteur kjjkjjzyayufqza. Product EXVS Mod Project. Bron
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// ------------------------------------------------
//

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(async () => null) }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openPath: vi.fn(async () => undefined) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
import en from "./i18n/en-US.json";
import zh from "./i18n/zh-CN.json";
import ps4En from "../ps4-common/i18n/en-US.json";
import ps4Zh from "../ps4-common/i18n/zh-CN.json";
import { MbonModdingReport } from "./MbonModdingPage";

const forbidden = /descatal|BoostStudio|github\.com\/descatal/i;

describe("MBON modding page", () => {
  it("renders backend payloads and keeps research names out of the catalogs", () => {
    render(
      <MbonModdingReport
        payload={{
          seed: "startup-archives",
          members: ["12/1212B83E.bin"],
          vertices: 0,
          boundingX: 2.25,
          scene: "{\"objects\":[{\"name\":\"tower\",\"x\":1,\"y\":2,\"z\":3}]}",
          detailName: "Demo",
          detailValue: "9",
          entryCount: 4,
        }}
      />,
    );
    expect(screen.getByText("startup-archives")).toBeInTheDocument();
    expect(screen.getByText("12/1212B83E.bin")).toBeInTheDocument();
    expect(screen.getByText("Vertices 0 X 2.25")).toBeInTheDocument();
    expect(screen.getByText(/tower/)).toBeInTheDocument();
    expect(screen.getByText("Demo 9")).toBeInTheDocument();
    expect(screen.getByText("Scripts 4")).toBeInTheDocument();
    const catalogs = JSON.stringify({ en, zh, ps4En, ps4Zh });
    expect(catalogs).not.toMatch(forbidden);
    expect(document.body.textContent ?? "").not.toMatch(forbidden);
  });
});
