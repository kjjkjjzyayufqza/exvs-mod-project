import { describe, expect, it } from "vitest";

import {
  buildMissionSpawnMarkers,
  groupMarkersByPhase,
  winFlagLabels,
  type MissionScriptSlot,
  type MissionStageScriptConfig,
} from "./missionPreviewService";

function slot(overrides: Partial<MissionScriptSlot> & { slot: number }): MissionScriptSlot {
  return {
    unitId: 0xf4629,
    team: 1,
    isCpuPartner: false,
    showPilotName: false,
    pilotNameHash: 0,
    position: [0, 0, 0],
    facingDegrees: 180,
    introAction: 0,
    introActionFrames: 0,
    aiLevel: 0,
    displayOrder: 0,
    ...overrides,
  };
}

/** Shaped after 000triad_battle_a001_001: two on the field, two opened, four waved in. */
function sampleConfig(): MissionStageScriptConfig {
  return {
    mapHash: 0xfe67f4f9,
    teamCosts: [0x1770, 0x1d4c, 0, 0, 0, 0],
    winFlags: 0x1,
    loseFlags: 0x5,
    targetCount: 0,
    allowedLosses: 1,
    bgmHash: 0xba15df91,
    slots: [
      slot({ slot: 0, team: 0, position: [150, 200, -40], facingDegrees: 0 }),
      slot({ slot: 1, team: 0, isCpuPartner: true, position: [120, 200, -40], facingDegrees: 0 }),
      slot({ slot: 2, position: [140, 200, 350] }),
      slot({ slot: 3, position: [90, 215, 395] }),
      slot({ slot: 4, position: [25, 120, 600] }),
      slot({ slot: 5, position: [-45, 100, 600] }),
    ],
    openingSlots: [2, 3],
    waves: [
      { enemiesAliveAtMost: 1, delaySeconds: 1, deploySlots: [4], messageHash: 0x2655484b },
      { enemiesAliveAtMost: 1, delaySeconds: 5, deploySlots: [5], messageHash: null },
    ],
  };
}

describe("buildMissionSpawnMarkers", () => {
  it("marks slots no function deploys as on the field from the first frame", () => {
    const markers = buildMissionSpawnMarkers(sampleConfig());

    expect(markers[0].phase).toEqual({ kind: "initial" });
    expect(markers[1].phase).toEqual({ kind: "initial" });
  });

  it("assigns the opening function's slots to the opening phase", () => {
    const markers = buildMissionSpawnMarkers(sampleConfig());

    expect(markers[2].phase).toEqual({ kind: "opening" });
    expect(markers[3].phase).toEqual({ kind: "opening" });
  });

  it("carries each wave's gate onto the slots that wave deploys", () => {
    const markers = buildMissionSpawnMarkers(sampleConfig());

    expect(markers[4].phase).toEqual({
      kind: "wave",
      waveIndex: 0,
      enemiesAliveAtMost: 1,
      delaySeconds: 1,
    });
    expect(markers[5].phase).toEqual({
      kind: "wave",
      waveIndex: 1,
      enemiesAliveAtMost: 1,
      delaySeconds: 5,
    });
  });

  it("keeps spawn position and facing exactly as the bytecode stores them", () => {
    const markers = buildMissionSpawnMarkers(sampleConfig());

    expect(markers[0].position).toEqual([150, 200, -40]);
    expect(markers[0].facingDegrees).toBe(0);
    expect(markers[2].position).toEqual([140, 200, 350]);
    expect(markers[2].facingDegrees).toBe(180);
  });

  it("gives a slot deployed by two waves the first one", () => {
    const config = sampleConfig();
    config.waves[1].deploySlots = [4, 5];
    const markers = buildMissionSpawnMarkers(config);

    expect(markers[4].phase).toMatchObject({ kind: "wave", waveIndex: 0 });
  });
});

describe("groupMarkersByPhase", () => {
  it("orders initial, then opening, then waves", () => {
    const groups = groupMarkersByPhase(buildMissionSpawnMarkers(sampleConfig()));

    expect(groups.map((group) => group.key)).toEqual([
      "initial",
      "opening",
      "wave-0",
      "wave-1",
    ]);
    expect(groups[0].markers).toHaveLength(2);
    expect(groups[1].markers).toHaveLength(2);
  });

  it("returns nothing for a script with no slots", () => {
    const config = sampleConfig();
    config.slots = [];
    expect(groupMarkersByPhase(buildMissionSpawnMarkers(config))).toEqual([]);
  });
});

describe("winFlagLabels", () => {
  it("splits the bit flags the config function sets", () => {
    expect(winFlagLabels(0x1)).toEqual(["wipeOut"]);
    expect(winFlagLabels(0x5)).toEqual(["wipeOut", "survive"]);
    expect(winFlagLabels(0x2)).toEqual(["targetCount"]);
    expect(winFlagLabels(0)).toEqual([]);
  });
});
