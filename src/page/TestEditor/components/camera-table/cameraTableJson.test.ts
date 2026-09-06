import { describe, expect, it } from "vitest";
import { CAM_CMD } from "./cameraCommandHashes";
import {
  CAMERA_TABLE_ENTRY_SIZE,
  CAMERA_TABLE_JSON_FILE_TYPE,
  applyCameraClipHash,
  cameraEntryFromRaw,
  removeCameraEntries,
  renameCameraEntryId,
  sortCameraTableByEntryId,
  writeCameraFieldFloat,
  writeCameraFieldUint,
  type CameraFieldSpec,
  type CameraTableData,
  type CameraTableEntry,
} from "./cameraTableDocument";
import {
  applyCameraTableImport,
  applyCameraTableJson,
  cloneCameraClipPackRows,
  cloneCameraShotRow,
  cloneCameraTableFromJson,
  detectCameraTableImportFormat,
  formatCameraClipJson,
  formatCameraShotJson,
  previewCameraTableImport,
} from "./cameraTableJson";
import { groupCameraPacks } from "./groupCameraPacks";

function spec(hash: number, entryOffset: number, kind: number): CameraFieldSpec {
  return { hash, entryOffset, flags: 0, kind };
}

const SPECS: CameraFieldSpec[] = [
  spec(CAM_CMD.firstShot, 0x2c, 1),
  spec(CAM_CMD.fovV0, 0x40, 5),
  spec(CAM_CMD.clipHash, 0x64, 1),
  spec(CAM_CMD.offset, 0xa0, 5),
  spec(CAM_CMD.sortKey, 0xac, 1),
  spec(CAM_CMD.duration, 0x28, 5),
];

function buildRow(
  clipHash: number,
  sortKey: number,
  fov: number | null,
  offset: number,
  firstShot: number,
  duration: number,
): number[] {
  let raw = new Array(CAMERA_TABLE_ENTRY_SIZE).fill(0);
  raw = writeCameraFieldUint(raw, 0x2c, firstShot);
  raw = writeCameraFieldFloat(raw, 0x40, fov ?? Number.NaN);
  raw = writeCameraFieldUint(raw, 0x64, clipHash);
  raw = writeCameraFieldFloat(raw, 0xa0, offset);
  raw = writeCameraFieldUint(raw, 0xac, sortKey);
  raw = writeCameraFieldFloat(raw, 0x28, duration);
  return raw;
}

function sampleTable(): CameraTableData {
  const rows: Array<{ entry: CameraTableEntry; raw: number[] }> = [
    {
      entry: {
        entryId: 0x11111111,
        entryIndex: 0,
        clipHash: 0x8ca6cc45,
        sortKey: 2,
        fov: 65,
        offset: 0,
        firstShot: 3,
      },
      raw: buildRow(0x8ca6cc45, 2, 65, 0, 3, 40),
    },
    {
      entry: {
        entryId: 0x22222222,
        entryIndex: 1,
        clipHash: 0x8ca6cc45,
        sortKey: 3,
        fov: null,
        offset: 1.5,
        firstShot: 0,
      },
      raw: buildRow(0x8ca6cc45, 3, null, 1.5, 0, 50),
    },
    {
      entry: {
        entryId: 0x33333333,
        entryIndex: 2,
        clipHash: 0xfd5fd16a,
        sortKey: 1412,
        fov: 11,
        offset: -5.5,
        firstShot: 1,
      },
      raw: buildRow(0xfd5fd16a, 1412, 11, -5.5, 1, 30),
    },
  ];
  return {
    header: {
      magic: 0,
      unk04: 0,
      fileSize: 0,
      unk0c: 0,
      entryCount: rows.length,
      commandsCount: SPECS.length,
      entrySize: CAMERA_TABLE_ENTRY_SIZE,
      unk1c: 0,
    },
    fieldSpecs: SPECS,
    entryIds: rows.map((row) => row.entry.entryId),
    entriesRaw: rows.map((row) => row.raw),
    trailingData: [],
    entries: rows.map((row) => row.entry),
    family: "02winlose",
  };
}

describe("cameraTableJson", () => {
  it("formats shot JSON and applies a partial fov edit onto the selected row", () => {
    const table = sampleTable();
    const text = formatCameraShotJson(table, "02winlose", 0);
    expect(text).toContain(CAMERA_TABLE_JSON_FILE_TYPE);
    expect(detectCameraTableImportFormat(text ?? "")).toBe("shot-json");

    const result = applyCameraTableJson(
      JSON.stringify({
        fileType: CAMERA_TABLE_JSON_FILE_TYPE,
        kind: "shot",
        entry: { fov: 42, fields: { duration: 80 } },
      }),
      table,
      "02winlose",
      0,
      groupCameraPacks(table.entries)[0] ?? null,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.table.entries[0]?.fov).toBe(42);
    expect(result.table.entries[0]?.entryId).toBe(0x11111111);
    expect(result.table.entries[0]?.clipHash).toBe(0x8ca6cc45);
  });

  it("keeps entryId when importing shot JSON and writes clipHash into raw", () => {
    const table = sampleTable();
    const pack = groupCameraPacks(table.entries)[0] ?? null;
    const result = applyCameraTableImport(
      JSON.stringify({
        fileType: CAMERA_TABLE_JSON_FILE_TYPE,
        kind: "shot",
        entryId: 0x99999999,
        entry: { clipHash: "0x1351B046", fov: 20 },
      }),
      table,
      "02winlose",
      0,
      pack,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.table.entries[0]?.entryId).toBe(0x11111111);
    expect(result.table.entries[0]?.clipHash).toBe(0x1351b046);
    expect(result.table.entryIds[0]).toBe(0x11111111);
  });

  it("clones a shot with a new row id and next sort key", () => {
    const table = sampleTable();
    const pack = groupCameraPacks(table.entries)[0];
    expect(pack).toBeTruthy();
    if (!pack) return;
    const result = cloneCameraShotRow(table, pack, pack.shots[0]!);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.table.entries).toHaveLength(4);
    const added = result.table.entries[3];
    expect(added?.entryId).toBe(0x33333334);
    expect(added?.clipHash).toBe(0x8ca6cc45);
    expect(added?.sortKey).toBe(4);
    expect(added?.firstShot).toBe(0);
    expect(result.table.header.entryCount).toBe(4);
  });

  it("clones a clip pack with an unused clip hash and unique row ids", () => {
    const table = sampleTable();
    const pack = groupCameraPacks(table.entries)[0];
    expect(pack).toBeTruthy();
    if (!pack) return;
    const result = cloneCameraClipPackRows(table, pack);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.selection.clipHash).not.toBe(pack.clipHash);
    expect(result.table.entries).toHaveLength(5);
    const cloned = result.table.entries.filter(
      (entry) => (entry.clipHash >>> 0) === (result.selection.clipHash >>> 0),
    );
    expect(cloned).toHaveLength(2);
    expect(cloned.map((entry) => entry.sortKey)).toEqual([1413, 1414]);
    expect(new Set(result.table.entryIds).size).toBe(5);
    expect(new Set(result.table.entries.map((entry) => entry.sortKey)).size).toBe(5);
  });

  it("renames a cloned row id, writes clip hash, and sorts unsigned ids", () => {
    const table = sampleTable();
    const pack = groupCameraPacks(table.entries)[0];
    expect(pack).toBeTruthy();
    if (!pack) return;
    const cloned = cloneCameraClipPackRows(table, pack);
    expect(cloned.ok).toBe(true);
    if (!cloned.ok) return;
    const first = cloned.table.entries.find(
      (entry) => (entry.entryId >>> 0) === (cloned.selection.entryId >>> 0),
    );
    expect(first).toBeTruthy();
    if (!first) return;
    const hashed = applyCameraClipHash(cloned.table, [first.entryIndex], 0x1351b046);
    expect(hashed.entries[first.entryIndex]?.clipHash).toBe(0x1351b046);
    const renamed = renameCameraEntryId(hashed, first.entryIndex, 0x10);
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;
    const sorted = sortCameraTableByEntryId(renamed.table);
    expect(sorted.entryIds[0]).toBe(0x10);
    expect(sorted.entries[0]?.clipHash).toBe(0x1351b046);
    expect(sorted.entries[0]?.entryIndex).toBe(0);
    const taken = renameCameraEntryId(sorted, 1, 0x10);
    expect(taken.ok).toBe(false);
  });

  it("removes one shot and reindexes remaining rows", () => {
    const table = sampleTable();
    const next = removeCameraEntries(table, [0]);
    expect(next.entries).toHaveLength(2);
    expect(next.entryIds).toEqual([0x22222222, 0x33333333]);
    expect(next.entries[0]?.entryIndex).toBe(0);
    expect(next.entries[0]?.entryId).toBe(0x22222222);
    expect(next.header.entryCount).toBe(2);
  });

  it("clones clip JSON with edited duration onto the new rows", () => {
    const table = sampleTable();
    const pack = groupCameraPacks(table.entries)[0];
    expect(pack).toBeTruthy();
    if (!pack) return;
    const payload = JSON.parse(formatCameraClipJson(table, "02winlose", pack)) as {
      shots: Array<{ fields: { duration: number } }>;
    };
    payload.shots[0]!.fields.duration = 99;
    const result = cloneCameraTableFromJson(
      JSON.stringify(payload),
      table,
      "02winlose",
      pack.shots[0]!.entryIndex,
      pack,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const cloned = groupCameraPacks(result.table.entries).find(
      (item) => (item.clipHash >>> 0) === (result.selection.clipHash >>> 0),
    );
    expect(cloned?.shots).toHaveLength(2);
    expect(result.selection.clipHash).not.toBe(pack.clipHash);
  });

  it("applies 220 hex bytes onto the selected shot", () => {
    const table = sampleTable();
    const pack = groupCameraPacks(table.entries)[0] ?? null;
    const replacement = buildRow(0x8028252f, 8, 25, 4, 1, 12);
    const hex = replacement.map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
    expect(detectCameraTableImportFormat(hex)).toBe("hex");
    const result = applyCameraTableImport(hex, table, "02winlose", 1, pack);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe("hex");
    expect(result.table.entries[1]?.clipHash).toBe(0x8028252f);
    expect(result.table.entries[1]?.sortKey).toBe(8);
    expect(result.table.entries[1]?.fov).toBe(25);
    expect(result.table.entries[1]?.entryId).toBe(0x22222222);
  });

  it("rejects full table JSON and hex inside JSON view apply", () => {
    const table = sampleTable();
    const pack = groupCameraPacks(table.entries)[0] ?? null;
    const full = previewCameraTableImport(
      JSON.stringify({ fileType: CAMERA_TABLE_JSON_FILE_TYPE, entries: table.entries }),
      table,
      "02winlose",
      0,
      pack,
    );
    expect(full.ok).toBe(false);
    expect(full.error).toContain("Full table JSON");

    const hex = applyCameraTableJson("00 01 02", table, "02winlose", 0, pack);
    expect(hex.ok).toBe(false);
    if (hex.ok) return;
    expect(hex.error).toContain("hex");
  });

  it("rejects clip JSON when shot count does not match the selected pack", () => {
    const table = sampleTable();
    const pack = groupCameraPacks(table.entries)[0];
    expect(pack).toBeTruthy();
    if (!pack) return;
    const preview = previewCameraTableImport(
      JSON.stringify({
        fileType: CAMERA_TABLE_JSON_FILE_TYPE,
        kind: "clip",
        clipHash: "0x8CA6CC45",
        shots: [{ fov: 1 }],
      }),
      table,
      "02winlose",
      0,
      pack,
    );
    expect(preview.ok).toBe(false);
    expect(preview.error).toContain("Shot count");
  });

  it("maps non-finite word40 offset to null so IPC JSON can save", () => {
    const raw = buildRow(0x8ca6cc45, 2, 65, Number.NaN, 3, 40);
    const entry = cameraEntryFromRaw(raw, SPECS, 0x11111111, 0);
    expect(entry.offset).toBeNull();
    expect(JSON.parse(JSON.stringify(entry)).offset).toBeNull();

    const table = sampleTable();
    const pack = groupCameraPacks(table.entries)[0];
    expect(pack).toBeTruthy();
    if (!pack) return;
    const applied = applyCameraTableJson(
      JSON.stringify({
        fileType: CAMERA_TABLE_JSON_FILE_TYPE,
        kind: "shot",
        entry: { offset: null },
      }),
      table,
      "02winlose",
      0,
      pack,
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.table.entries[0]?.offset).toBeNull();
  });
});
