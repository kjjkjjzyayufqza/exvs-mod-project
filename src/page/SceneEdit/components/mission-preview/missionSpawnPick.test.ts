import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { frontMissionSpawnSlot, tagMissionSpawn } from "./missionSpawnPick";

function mesh(name: string): THREE.Mesh {
  const object = new THREE.Mesh();
  object.name = name;
  return object;
}

describe("frontMissionSpawnSlot", () => {
  it("keeps the nearest spawn and ignores the map behind it", () => {
    const spawn = mesh("spawn");
    const map = mesh("map");
    tagMissionSpawn(spawn, 4, false);

    expect(
      frontMissionSpawnSlot([
        { object: spawn, distance: 2 },
        { object: map, distance: 8 },
      ]),
    ).toBe(4);
  });

  it("lets the map win when an unselected spawn is only behind it", () => {
    const map = mesh("map");
    const spawn = mesh("spawn");
    tagMissionSpawn(spawn, 4, false);

    expect(
      frontMissionSpawnSlot([
        { object: map, distance: 2 },
        { object: spawn, distance: 8 },
      ]),
    ).toBeNull();
  });

  it("keeps the selected spawn when its overlay is drawn over a closer map hit", () => {
    const map = mesh("map");
    const spawn = mesh("spawn");
    tagMissionSpawn(spawn, 7, true);

    expect(
      frontMissionSpawnSlot([
        { object: map, distance: 2 },
        { object: spawn, distance: 8 },
      ]),
    ).toBe(7);
  });

  it("prefers a closer spawn over the selected one behind it", () => {
    const front = mesh("front");
    const selected = mesh("selected");
    const map = mesh("map");
    tagMissionSpawn(front, 1, false);
    tagMissionSpawn(selected, 7, true);

    expect(
      frontMissionSpawnSlot([
        { object: front, distance: 1 },
        { object: map, distance: 3 },
        { object: selected, distance: 9 },
      ]),
    ).toBe(1);
  });

  it("reads the slot from a parent group", () => {
    const group = new THREE.Group();
    const child = mesh("child");
    group.add(child);
    tagMissionSpawn(group, 3, false);

    expect(frontMissionSpawnSlot([{ object: child, distance: 1 }])).toBe(3);
  });
});
