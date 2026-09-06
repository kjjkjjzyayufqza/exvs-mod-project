import { formatCameraHash, type CameraTableEntry } from "./cameraTableDocument";

export type CameraClipPack = {
  clipHash: number;
  sortKeyStart: number;
  sortKeyEnd: number;
  consecutive: boolean;
  shots: CameraTableEntry[];
};

export function findCameraPackForEntry(
  packs: CameraClipPack[],
  entryIndex: number,
): { pack: CameraClipPack; shotIndex: number } | null {
  for (const pack of packs) {
    const shotIndex = pack.shots.findIndex((shot) => shot.entryIndex === entryIndex);
    if (shotIndex >= 0) return { pack, shotIndex };
  }
  return null;
}

function normalizeCameraSearch(value: string): string {
  return value.toLowerCase().replace(/^0x/, "").replace(/[^a-z0-9.-]/g, "");
}

function uint32SearchTokens(value: number): string[] {
  const unsigned = value >>> 0;
  const hex = unsigned.toString(16).padStart(8, "0");
  const le = [
    unsigned & 0xff,
    (unsigned >>> 8) & 0xff,
    (unsigned >>> 16) & 0xff,
    (unsigned >>> 24) & 0xff,
  ]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const be = hex;
  return [String(unsigned), hex, `0x${hex}`, le, be].map(normalizeCameraSearch);
}

export function cameraEntryMatchesQuery(entry: CameraTableEntry, query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith("#")) {
    return String(entry.entryIndex).includes(trimmed.slice(1).trim());
  }
  const needle = normalizeCameraSearch(trimmed);
  if (!needle) return true;
  const haystack = [
    `#${entry.entryIndex}`,
    String(entry.entryIndex),
    String(entry.sortKey),
    formatCameraHash(entry.entryId),
    formatCameraHash(entry.clipHash),
    ...uint32SearchTokens(entry.entryId),
    ...uint32SearchTokens(entry.clipHash),
  ];
  return haystack.some((candidate) => candidate.includes(needle));
}

export function filterCameraTableEntries(
  entries: CameraTableEntry[],
  query: string,
): CameraTableEntry[] {
  const trimmed = query.trim();
  if (!trimmed) return entries;
  return entries.filter((entry) => cameraEntryMatchesQuery(entry, trimmed));
}

export function filterCameraPacks(packs: CameraClipPack[], query: string): CameraClipPack[] {
  const trimmed = query.trim();
  if (!trimmed) return packs;
  return packs.filter((pack) => pack.shots.some((shot) => cameraEntryMatchesQuery(shot, trimmed)));
}

export type CameraSequenceRow =
  | { kind: "pack"; packIndex: number; pack: CameraClipPack }
  | {
      kind: "shot";
      packIndex: number;
      shotIndex: number;
      shotCount: number;
      pack: CameraClipPack;
      entry: CameraTableEntry;
      isFirst: boolean;
      isLast: boolean;
    };

export function buildCameraSequenceRows(packs: CameraClipPack[]): CameraSequenceRow[] {
  const rows: CameraSequenceRow[] = [];
  packs.forEach((pack, packIndex) => {
    rows.push({ kind: "pack", packIndex, pack });
    pack.shots.forEach((entry, shotIndex) => {
      rows.push({
        kind: "shot",
        packIndex,
        shotIndex,
        shotCount: pack.shots.length,
        pack,
        entry,
        isFirst: shotIndex === 0,
        isLast: shotIndex === pack.shots.length - 1,
      });
    });
  });
  return rows;
}

export function sequenceShotEntryIndexes(packs: CameraClipPack[]): number[] {
  return packs.flatMap((pack) => pack.shots.map((shot) => shot.entryIndex));
}

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
