import { describe, expect, it } from "vitest";

import type { MissionSpawnMarker } from "@/services/missionPreview/missionPreviewService";
import {
  MISSION_ALLY_COLOR,
  MISSION_ENEMY_COLOR,
  MISSION_PARTNER_COLOR,
  MISSION_WAVE_COLORS,
  missionFacingForward,
  missionMarkerColor,
  missionPhaseKey,
} from "./missionPreviewTheme";

/** Round away float noise, and normalise the -0 that cos(270°) rounds to. */
function round(value: number): number {
  const rounded = Math.round(value * 1e6) / 1e6;
  return rounded === 0 ? 0 : rounded;
}

function forward(facingDegrees: number): [number, number, number] {
  return missionFacingForward(facingDegrees).map(round) as [number, number, number];
}

describe("missionFacingForward", () => {
  it("looks down +Z at 0 and -Z at 180", () => {
    expect(forward(0)).toEqual([0, 0, 1]);
    expect(forward(180)).toEqual([0, 0, -1]);
  });

  it("turns toward +X at 90 and -X at 270", () => {
    expect(forward(90)).toEqual([1, 0, 0]);
    expect(forward(270)).toEqual([-1, 0, 0]);
  });

  it("never tilts out of the ground plane", () => {
    for (const degrees of [0, 45, 90, 135, 180, 225, 270, 315, 360]) {
      expect(forward(degrees)[1]).toBe(0);
    }
  });

  it("points the two sides of 000triad_battle_a001_001 at each other", () => {
    // Regression: the viewport wedge was authored along -Z, so both sides were
    // drawn facing away from the battle.
    const player = { z: -40, facing: 0 };
    const enemy = { z: 350, facing: 180 };

    const playerForwardZ = missionFacingForward(player.facing)[2];
    const enemyForwardZ = missionFacingForward(enemy.facing)[2];

    // The player sits at the low-Z end and must look toward the high-Z end.
    expect(Math.sign(playerForwardZ)).toBe(Math.sign(enemy.z - player.z));
    // The enemy sits at the high-Z end and must look back down toward it.
    expect(Math.sign(enemyForwardZ)).toBe(Math.sign(player.z - enemy.z));
  });
});

function marker(overrides: Partial<MissionSpawnMarker>): MissionSpawnMarker {
  return {
    key: "mission-slot-0",
    slot: 0,
    unitId: 0xf4629,
    team: 1,
    isCpuPartner: false,
    position: [0, 0, 0],
    facingDegrees: 180,
    introAction: 0,
    introActionFrames: 0,
    aiLevel: 0,
    phase: { kind: "initial" },
    ...overrides,
  };
}

describe("missionMarkerColor", () => {
  it("separates the player, the CPU partner and the enemy side", () => {
    expect(missionMarkerColor(marker({ team: 0 }))).toBe(MISSION_ALLY_COLOR);
    expect(missionMarkerColor(marker({ team: 0, isCpuPartner: true }))).toBe(
      MISSION_PARTNER_COLOR,
    );
    expect(missionMarkerColor(marker({ team: 1 }))).toBe(MISSION_ENEMY_COLOR);
  });

  it("gives each later wave its own tone and cycles past the last one", () => {
    const waveColor = (waveIndex: number) =>
      missionMarkerColor(
        marker({
          team: 1,
          phase: { kind: "wave", waveIndex, enemiesAliveAtMost: 1, delaySeconds: 1 },
        }),
      );

    expect(waveColor(0)).toBe(MISSION_WAVE_COLORS[0]);
    expect(waveColor(1)).toBe(MISSION_WAVE_COLORS[1]);
    expect(waveColor(MISSION_WAVE_COLORS.length)).toBe(MISSION_WAVE_COLORS[0]);
  });

  it("keeps the player side's colour even when a wave deploys it", () => {
    expect(
      missionMarkerColor(
        marker({
          team: 0,
          phase: { kind: "wave", waveIndex: 0, enemiesAliveAtMost: 1, delaySeconds: 1 },
        }),
      ),
    ).toBe(MISSION_ALLY_COLOR);
  });
});

describe("missionPhaseKey", () => {
  it("keys each phase group", () => {
    expect(missionPhaseKey({ kind: "initial" })).toBe("initial");
    expect(missionPhaseKey({ kind: "opening" })).toBe("opening");
    expect(
      missionPhaseKey({ kind: "wave", waveIndex: 2, enemiesAliveAtMost: 1, delaySeconds: 5 }),
    ).toBe("wave-2");
  });
});
