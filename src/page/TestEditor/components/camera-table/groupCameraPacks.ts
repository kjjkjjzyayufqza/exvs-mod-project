import type { CameraTableEntry } from "./cameraTableDocument";

export type CameraClipPack = {
  clipHash: number;
  sortKeyStart: number;
  sortKeyEnd: number;
  consecutive: boolean;
  shots: CameraTableEntry[];
};

export function groupCameraPacks(entries: CameraTableEntry[]): CameraClipPack[] {
  const byHash = new Map<number, CameraTableEntry[]>();
  for (const entry of entries) {
    const list = byHash.get(entry.clipHash) ?? [];
    list.push(entry);
    byHash.set(entry.clipHash, list);
  }

  const packs: CameraClipPack[] = [];
  for (const [clipHash, group] of byHash) {
    const shots = [...group].sort(
      (a, b) => a.sortKey - b.sortKey || a.entryIndex - b.entryIndex,
    );
    let consecutive = shots.length > 0;
    for (let i = 1; i < shots.length; i += 1) {
      if (shots[i].sortKey !== shots[i - 1].sortKey + 1) {
        consecutive = false;
        break;
      }
    }
    packs.push({
      clipHash,
      sortKeyStart: shots[0]?.sortKey ?? 0,
      sortKeyEnd: shots[shots.length - 1]?.sortKey ?? 0,
      consecutive,
      shots,
    });
  }

  packs.sort((a, b) => a.sortKeyStart - b.sortKeyStart || a.clipHash - b.clipHash);
  return packs;
}
