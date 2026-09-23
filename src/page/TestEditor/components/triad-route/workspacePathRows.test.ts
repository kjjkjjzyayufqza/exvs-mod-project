import { describe, expect, it } from "vitest";
import { buildWorkspacePathRows } from "./workspacePathRows";
import type { ResolvedTriadPacks, TriadContentId } from "./triadRouteWorkspace";

/** Minimal stand-in for what `resolveTriadPacks` returns. */
function packs(options?: {
  notUnpacked?: TriadContentId[];
  scriptDirs?: string[];
}): ResolvedTriadPacks {
  const notUnpacked = options?.notUnpacked ?? [];
  const folders: Record<TriadContentId, string> = {
    "triad-battle-list": "E:\\XB\\mod\\012list\\triad_battle_list",
    "scene-id-table": "E:\\XB\\mod\\051mission\\sceneidtable",
    outmission: "E:\\XB\\mod\\051mission\\outmission",
    "pilot-name-list": "E:\\XB\\mod\\051mission\\pilot_name_list",
  };
  const locations = Object.fromEntries(
    (Object.keys(folders) as TriadContentId[]).map((id) => [
      id,
      {
        configured: { folderPath: folders[id] },
        existing: notUnpacked.includes(id) ? null : { folderPath: folders[id] },
      },
    ]),
  );

  return {
    locations,
    missing: notUnpacked.filter((id) => id !== "pilot-name-list"),
    notUnpacked,
    paths: {
      triadListDir: folders["triad-battle-list"],
      sceneIdTableDir: folders["scene-id-table"],
      outmissionDir: folders.outmission,
      pilotNameListDir: folders["pilot-name-list"],
      packageRoots: [],
      scriptDirs: options?.scriptDirs ?? ["E:\\XB\\mod/051mission"],
    },
  } as unknown as ResolvedTriadPacks;
}

const ENVIRONMENT = {
  workspaceRoot: "E:\\XB\\mod",
  dplCacheDir: "E:\\OBHK0.3_v27\\data\\x64\\dplcache_release",
  modFolder: "E:\\OBHK0.3_v27\\data\\x64\\mod",
};

describe("buildWorkspacePathRows", () => {
  it("lists the environment paths before any package is resolved", () => {
    const rows = buildWorkspacePathRows({ ...ENVIRONMENT, packs: null });
    expect(rows.map((row) => row.id)).toEqual([
      "workspace-root",
      "dplcache",
      "mod-folder",
    ]);
    expect(rows[2]?.path).toBe(ENVIRONMENT.modFolder);
  });

  it("adds the four shared packages with their hashes and the script roots", () => {
    const rows = buildWorkspacePathRows({ ...ENVIRONMENT, packs: packs() });
    expect(rows.map((row) => row.id)).toEqual([
      "workspace-root",
      "dplcache",
      "mod-folder",
      "pack:triad-battle-list",
      "pack:scene-id-table",
      "pack:outmission",
      "pack:pilot-name-list",
      "script-root:0",
    ]);

    const tables = rows.find((row) => row.id === "pack:triad-battle-list");
    expect(tables?.hash).toBe("0xE952325A");
    expect(tables?.packLabel).toBe("Triad Battle List");
    expect(tables?.path).toBe("E:\\XB\\mod\\012list\\triad_battle_list");
  });

  it("marks the pilot name list optional and the other three required", () => {
    const rows = buildWorkspacePathRows({ ...ENVIRONMENT, packs: packs() });
    const required = Object.fromEntries(
      rows.filter((row) => row.kind === "pack").map((row) => [row.id, row.required]),
    );
    expect(required).toEqual({
      "pack:triad-battle-list": true,
      "pack:scene-id-table": true,
      "pack:outmission": true,
      "pack:pilot-name-list": false,
    });
  });

  it("still reports the folder it looked in for a package that is not unpacked", () => {
    const rows = buildWorkspacePathRows({
      ...ENVIRONMENT,
      packs: packs({ notUnpacked: ["scene-id-table"] }),
    });
    const sceneIds = rows.find((row) => row.id === "pack:scene-id-table");
    expect(sceneIds?.path).toBe("E:\\XB\\mod\\051mission\\sceneidtable");
    expect(sceneIds?.required).toBe(true);
  });

  it("leaves an unset environment path empty so the panel can say so", () => {
    const rows = buildWorkspacePathRows({
      ...ENVIRONMENT,
      modFolder: "   ",
      packs: null,
    });
    expect(rows.find((row) => row.id === "mod-folder")?.path).toBe("");
  });

  it("gives every script root its own row", () => {
    const rows = buildWorkspacePathRows({
      ...ENVIRONMENT,
      packs: packs({ scriptDirs: ["E:\\XB\\mod/051mission", "E:\\XB\\mod/052data"] }),
    });
    expect(
      rows.filter((row) => row.kind === "script-root").map((row) => row.path),
    ).toEqual(["E:\\XB\\mod/051mission", "E:\\XB\\mod/052data"]);
  });
});
