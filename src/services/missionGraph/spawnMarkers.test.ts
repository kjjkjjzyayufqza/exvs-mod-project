import { describe, expect, it } from "vitest";
import { createGraph } from "./graph";
import { commitSpawnTransform, markersFromGraph, slotUsesExternalCoordinates } from "./spawnMarkers";

describe("mission spawn markers", () => {
  it("writes rounded coordinates onto that slot only", () => {
    const graph = createGraph();
    const source = graph.slots[2];
    const other = graph.slots[3];
    const otherPosition = other.params.slice(34, 37);
    const next = commitSpawnTransform(graph, source.params[0], { x: 10.6, y: -2.2, z: 30.4, facing: 400.2 });
    expect(next).not.toBeNull();
    const markers = markersFromGraph(next!);
    expect(markers.find((marker) => marker.slot === source.params[0])?.position).toEqual([11, -2, 30]);
    expect(markers.find((marker) => marker.slot === source.params[0])?.facingDegrees).toBe(40);
    expect(next!.slots.find((slot) => slot.params[0] === other.params[0])?.params.slice(34, 37)).toEqual(otherPosition);
  });

  it("does not commit a drag while external coordinates override the slot", () => {
    const graph = createGraph();
    const slot = graph.slots[2];
    slot.params[33] = 1;
    const before = slot.params.slice();
    expect(slotUsesExternalCoordinates(graph, slot.params[0])).toBe(true);
    expect(commitSpawnTransform(graph, slot.params[0], { x: 1, y: 2, z: 3, facing: 90 })).toBeNull();
    expect(slot.params).toEqual(before);
  });
});
