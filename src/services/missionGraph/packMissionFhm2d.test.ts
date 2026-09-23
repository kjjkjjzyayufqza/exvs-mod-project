import { describe, expect, it } from "vitest";

import { missionPackPaths } from "./packMissionFhm2d";

describe("missionPackPaths", () => {
  it("points the binary at the package folder and the structure beside that folder", () => {
    const paths = missionPackPaths(
      "E:/ws/051mission/000triad_battle_a022_001/000triad_battle_a022_001.c",
    );
    expect(paths.binaryPath).toBe(
      "E:\\ws\\051mission\\000triad_battle_a022_001\\000triad_battle_a022_001.mismsexc",
    );
    expect(paths.packageDir).toBe("E:\\ws\\051mission\\000triad_battle_a022_001");
    expect(paths.structureCandidates[0]).toBe(
      "E:\\ws\\051mission\\000triad_battle_a022_001_structure.json",
    );
  });
});
