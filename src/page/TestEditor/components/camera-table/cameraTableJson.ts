import {
  CAM_CMD,
  cameraCommandHash,
  cameraCommandName,
} from "./cameraCommandHashes";
import {
  CAMERA_TABLE_ENTRY_SIZE,
  CAMERA_TABLE_JSON_FILE_TYPE,
  allocateCameraEntryIds,
  allocateCameraSortKeys,
  appendCameraEntries,
  cameraFieldFloat,
  cameraFieldUint,
  cameraSpecOffset,
  formatCameraHash,
  replaceCameraEntryRaw,
  unusedCameraClipHash,
  writeCameraFieldFloat,
  writeCameraFieldUint,
  writeCameraFloatHash,
  writeCameraUintHash,
  type CameraFieldSpec,
  type CameraTableData,
  type CameraTableEntry,
} from "./cameraTableDocument";
import type { CameraClipPack } from "./groupCameraPacks";

export type CameraTableJsonKind = "shot" | "clip";
export type CameraTableImportFormat = "hex" | "shot-json" | "clip-json" | "unknown";

export type CameraTableImportPreview = {
  format: CameraTableImportFormat;
  ok: boolean;
  idle?: boolean;
  error?: string;
  warning?: string;
  byteCount?: number;
  fieldCount?: number;
  shotCount?: number;
  clipHash?: number;
};

export type CameraTableJsonSelection = {
  clipHash: number;
  entryId: number;
  clearSearch?: boolean;
};

export type CameraTableJsonApplyResult =
  | { ok: true; table: CameraTableData; selection: CameraTableJsonSelection; format: CameraTableImportFormat }
  | { ok: false; error: string };

const NAMED_FIELD_HASHES = new Set<number>([
  CAM_CMD.clipHash >>> 0,
  CAM_CMD.sortKey >>> 0,
  CAM_CMD.fovV0 >>> 0,
  CAM_CMD.offset >>> 0,
  CAM_CMD.firstShot >>> 0,
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tryParseJson(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

export function parseCameraHashValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value >>> 0;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (/^0x[0-9a-fA-F]+$/i.test(trimmed)) return Number.parseInt(trimmed, 16) >>> 0;
  if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10) >>> 0;
  return null;
}

function parseFloatOrNan(value: unknown): number | null {
  if (value === null) return Number.NaN;
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return Number.NaN;
  if (trimmed.toLowerCase() === "nan") return Number.NaN;
  const next = Number(trimmed);
  return Number.isFinite(next) ? next : null;
}

function parseHexBytes(text: string): number[] | null {
  const tokens = text.trim().match(/[0-9A-Fa-f]{2}/g);
  if (!tokens || tokens.length === 0) return null;
  return tokens.map((token) => Number.parseInt(token, 16));
}

function resolveFieldHash(key: string, specs: CameraFieldSpec[]): number | null {
  const named = cameraCommandHash(key);
  if (named != null) return named;
  const hashed = parseCameraHashValue(key);
  if (hashed == null) return null;
  return specs.some((spec) => (spec.hash >>> 0) === hashed) ? hashed : null;
}

function fieldsFromRaw(raw: number[] | undefined, specs: CameraFieldSpec[]): Record<string, number | null> {
  const fields: Record<string, number | null> = {};
  for (const spec of specs) {
    const hash = spec.hash >>> 0;
    if (NAMED_FIELD_HASHES.has(hash)) continue;
    const key = cameraCommandName(hash) ?? formatCameraHash(hash);
    if (spec.kind === 5) {
      const value = cameraFieldFloat(raw, spec.entryOffset);
      fields[key] = Number.isFinite(value) ? value : null;
    } else {
      fields[key] = cameraFieldUint(raw, spec.entryOffset);
    }
  }
  return fields;
}

function shotJsonFromEntry(
  table: CameraTableData,
  entry: CameraTableEntry,
): Record<string, unknown> {
  const raw = table.entriesRaw[entry.entryIndex];
  return {
    entryId: formatCameraHash(entry.entryId),
    entryIndex: entry.entryIndex,
    clipHash: formatCameraHash(entry.clipHash),
    sortKey: entry.sortKey,
    fov: entry.fov,
    offset: entry.offset,
    firstShot: entry.firstShot,
    fields: fieldsFromRaw(raw, table.fieldSpecs ?? []),
  };
}

export function formatCameraShotJson(
  table: CameraTableData,
  family: string,
  entryIndex: number,
): string | null {
  const entry = table.entries.find((item) => item.entryIndex === entryIndex) ?? table.entries[entryIndex];
  if (!entry) return null;
  return JSON.stringify(
    {
      fileType: CAMERA_TABLE_JSON_FILE_TYPE,
      kind: "shot",
      family,
      index: entry.entryIndex,
      entryId: formatCameraHash(entry.entryId),
      entry: shotJsonFromEntry(table, entry),
    },
    null,
    2,
  );
}

export function formatCameraClipJson(
  table: CameraTableData,
  family: string,
  pack: CameraClipPack,
): string {
  return JSON.stringify(
    {
      fileType: CAMERA_TABLE_JSON_FILE_TYPE,
      kind: "clip",
      family,
      clipHash: formatCameraHash(pack.clipHash),
      shots: pack.shots.map((shot) => shotJsonFromEntry(table, shot)),
    },
    null,
    2,
  );
}

type ExtractedShot = {
  kind: "shot";
  family?: string;
  fileType?: string;
  entry: Record<string, unknown>;
};

type ExtractedClip = {
  kind: "clip";
  family?: string;
  fileType?: string;
  clipHash?: unknown;
  shots: unknown[];
};

type ExtractedPayload = ExtractedShot | ExtractedClip;

function looksLikeShotEntry(value: Record<string, unknown>): boolean {
  return (
    "clipHash" in value ||
    "sortKey" in value ||
    "fov" in value ||
    "offset" in value ||
    "firstShot" in value ||
    "fields" in value ||
    "entryId" in value
  );
}

function extractPayload(parsed: unknown): ExtractedPayload | null {
  if (!isRecord(parsed)) return null;
  const fileType = typeof parsed.fileType === "string" ? parsed.fileType : undefined;
  const family = typeof parsed.family === "string" ? parsed.family : undefined;

  if (parsed.kind === "clip" || Array.isArray(parsed.shots)) {
    if (!Array.isArray(parsed.shots)) return null;
    return { kind: "clip", family, fileType, clipHash: parsed.clipHash, shots: parsed.shots };
  }

  if (Array.isArray(parsed.entries)) return null;

  if (isRecord(parsed.entry)) {
    return { kind: "shot", family, fileType, entry: parsed.entry };
  }

  if (parsed.kind === "shot" && isRecord(parsed.entry)) {
    return { kind: "shot", family, fileType, entry: parsed.entry };
  }

  if (looksLikeShotEntry(parsed)) {
    return { kind: "shot", family, fileType, entry: parsed };
  }

  return null;
}

type ParsedShotPatch = {
  overlay: Partial<CameraTableEntry>;
  fields: Record<string, unknown> | null;
  hasChange: boolean;
};

function parseShotPatch(entry: Record<string, unknown>): { ok: true; patch: ParsedShotPatch } | { ok: false; error: string } {
  const overlay: Partial<CameraTableEntry> = {};
  if ("clipHash" in entry) {
    const value = parseCameraHashValue(entry.clipHash);
    if (value == null) return { ok: false, error: "clipHash must be an integer or 0x hex string." };
    overlay.clipHash = value;
  }
  if ("sortKey" in entry) {
    const value = parseCameraHashValue(entry.sortKey);
    if (value == null) return { ok: false, error: "sortKey must be an integer." };
    overlay.sortKey = value;
  }
  if ("firstShot" in entry) {
    const value = parseCameraHashValue(entry.firstShot);
    if (value == null) return { ok: false, error: "firstShot must be an integer." };
    overlay.firstShot = value;
  }
  if ("offset" in entry) {
    const value = parseFloatOrNan(entry.offset);
    if (value == null) return { ok: false, error: "offset must be a number or null." };
    overlay.offset = Number.isFinite(value) ? value : null;
  }
  if ("fov" in entry) {
    const value = parseFloatOrNan(entry.fov);
    if (value == null) return { ok: false, error: "fov must be a number or null." };
    overlay.fov = Number.isFinite(value) ? value : null;
  }

  let fields: Record<string, unknown> | null = null;
  if ("fields" in entry) {
    if (entry.fields != null && !isRecord(entry.fields)) {
      return { ok: false, error: "fields must be an object." };
    }
    fields = entry.fields ?? null;
  }

  const hasChange =
    overlay.clipHash !== undefined ||
    overlay.sortKey !== undefined ||
    overlay.firstShot !== undefined ||
    overlay.offset !== undefined ||
    overlay.fov !== undefined ||
    (fields != null && Object.keys(fields).length > 0);

  return { ok: true, patch: { overlay, fields, hasChange } };
}

function applyFieldsToRaw(
  raw: number[],
  specs: CameraFieldSpec[],
  fields: Record<string, unknown>,
): { ok: true; raw: number[] } | { ok: false; error: string } {
  let next = raw.slice();
  const unknown: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    const hash = resolveFieldHash(key, specs);
    if (hash == null) {
      unknown.push(key);
      continue;
    }
    const offset = cameraSpecOffset(specs, hash);
    const spec = specs.find((item) => (item.hash >>> 0) === hash);
    if (offset == null || !spec) {
      unknown.push(key);
      continue;
    }
    if (spec.kind === 5) {
      const parsed = parseFloatOrNan(value);
      if (parsed == null) {
        return { ok: false, error: `Field "${key}" must be a number or null.` };
      }
      next = writeCameraFieldFloat(next, offset, parsed);
    } else {
      const parsed = parseCameraHashValue(value);
      if (parsed == null) {
        return { ok: false, error: `Field "${key}" must be an integer or 0x hex string.` };
      }
      next = writeCameraFieldUint(next, offset, parsed);
    }
  }
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `Unknown field(s): ${unknown.slice(0, 4).join(", ")}${unknown.length > 4 ? "…" : ""}.`,
    };
  }
  return { ok: true, raw: next };
}

function writeNamedOverlay(
  raw: number[],
  specs: CameraFieldSpec[],
  overlay: Partial<CameraTableEntry>,
): number[] {
  let next = raw.slice();
  if (overlay.clipHash !== undefined) {
    next = writeCameraUintHash(next, specs, CAM_CMD.clipHash, overlay.clipHash);
  }
  if (overlay.sortKey !== undefined) {
    next = writeCameraUintHash(next, specs, CAM_CMD.sortKey, overlay.sortKey);
  }
  if (overlay.firstShot !== undefined) {
    next = writeCameraUintHash(next, specs, CAM_CMD.firstShot, overlay.firstShot);
  }
  if (overlay.offset !== undefined) {
    next = writeCameraFloatHash(next, specs, CAM_CMD.offset, overlay.offset ?? Number.NaN);
  }
  if (overlay.fov !== undefined) {
    next = writeCameraFloatHash(next, specs, CAM_CMD.fovV0, overlay.fov ?? Number.NaN);
  }
  return next;
}

function patchRaw(
  raw: number[],
  specs: CameraFieldSpec[],
  patch: ParsedShotPatch,
): { ok: true; raw: number[] } | { ok: false; error: string } {
  let next = raw.slice();
  if (patch.fields) {
    const applied = applyFieldsToRaw(next, specs, patch.fields);
    if (!applied.ok) return applied;
    next = applied.raw;
  }
  next = writeNamedOverlay(next, specs, patch.overlay);
  return { ok: true, raw: next };
}

function fileTypeError(fileType: string | undefined): string | null {
  if (fileType && fileType !== CAMERA_TABLE_JSON_FILE_TYPE) {
    return `File type mismatch: expected "${CAMERA_TABLE_JSON_FILE_TYPE}", got "${fileType}".`;
  }
  return null;
}

function familyWarning(family: string, payloadFamily: string | undefined): string | undefined {
  if (payloadFamily && payloadFamily !== family) {
    return `Family is "${payloadFamily}" (current table is "${family}"). Schema matches; values will still apply.`;
  }
  return undefined;
}

export function detectCameraTableImportFormat(text: string): CameraTableImportFormat {
  const trimmed = text.trim();
  if (!trimmed) return "unknown";
  const parsed = tryParseJson(trimmed);
  if (parsed !== null) {
    const extracted = extractPayload(parsed);
    if (extracted?.kind === "clip") return "clip-json";
    if (extracted?.kind === "shot") return "shot-json";
    return "unknown";
  }
  if (parseHexBytes(trimmed)) return "hex";
  return "unknown";
}

export function previewCameraTableImport(
  text: string,
  table: CameraTableData,
  family: string,
  selectedEntryIndex: number | null,
  pack: CameraClipPack | null,
): CameraTableImportPreview {
  const trimmed = text.trim();
  if (!trimmed) return { format: "unknown", ok: false, idle: true };

  const parsedJson = tryParseJson(trimmed);
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    if (parsedJson === null) {
      return { format: "unknown", ok: false, error: "Invalid JSON." };
    }
    if (isRecord(parsedJson) && Array.isArray(parsedJson.entries) && parsedJson.kind !== "clip") {
      return {
        format: "unknown",
        ok: false,
        error: "Full table JSON is not supported. Paste a clip or shot JSON payload.",
      };
    }
    const extracted = extractPayload(parsedJson);
    if (!extracted) {
      return { format: "unknown", ok: false, error: "JSON does not contain a camera clip or shot object." };
    }
    const typeError = fileTypeError(extracted.fileType);
    if (typeError) {
      return { format: extracted.kind === "clip" ? "clip-json" : "shot-json", ok: false, error: typeError };
    }

    if (extracted.kind === "shot") {
      if (selectedEntryIndex == null) {
        return { format: "shot-json", ok: false, error: "No shot selected." };
      }
      const parsed = parseShotPatch(extracted.entry);
      if (!parsed.ok) return { format: "shot-json", ok: false, error: parsed.error };
      if (!parsed.patch.hasChange) {
        return { format: "shot-json", ok: false, error: "No camera fields to apply." };
      }
      if (parsed.patch.fields) {
        const probe = applyFieldsToRaw(
          (table.entriesRaw[selectedEntryIndex] ?? []).slice(),
          table.fieldSpecs ?? [],
          parsed.patch.fields,
        );
        if (!probe.ok) return { format: "shot-json", ok: false, error: probe.error };
      }
      const nextHash = parsed.patch.overlay.clipHash;
      const current = table.entries[selectedEntryIndex];
      const warningParts = [familyWarning(family, extracted.family)];
      if (nextHash != null && current && (nextHash >>> 0) !== (current.clipHash >>> 0)) {
        const joins = table.entries.some(
          (entry) => (entry.clipHash >>> 0) === nextHash && entry.entryIndex !== selectedEntryIndex,
        );
        warningParts.push(
          joins
            ? `Shot will join existing clip ${formatCameraHash(nextHash)}.`
            : `Shot clip hash will change to ${formatCameraHash(nextHash)}.`,
        );
      }
      return {
        format: "shot-json",
        ok: true,
        fieldCount: Object.keys(extracted.entry).length,
        warning: warningParts.filter(Boolean).join(" ") || undefined,
      };
    }

    if (!pack) return { format: "clip-json", ok: false, error: "No clip selected." };
    if (extracted.shots.length !== pack.shots.length) {
      return {
        format: "clip-json",
        ok: false,
        error: `Shot count ${extracted.shots.length} != pack ${pack.shots.length}. Use Clone to add a clip, or Clone shot to add one row.`,
        shotCount: extracted.shots.length,
      };
    }
    for (let index = 0; index < extracted.shots.length; index += 1) {
      const shot = extracted.shots[index];
      if (!isRecord(shot)) {
        return { format: "clip-json", ok: false, error: `shots[${index}] must be an object.` };
      }
      const parsed = parseShotPatch(shot);
      if (!parsed.ok) return { format: "clip-json", ok: false, error: `shots[${index}]: ${parsed.error}` };
      if (parsed.patch.fields) {
        const targetIndex = pack.shots[index]?.entryIndex ?? -1;
        const probe = applyFieldsToRaw(
          (table.entriesRaw[targetIndex] ?? []).slice(),
          table.fieldSpecs ?? [],
          parsed.patch.fields,
        );
        if (!probe.ok) return { format: "clip-json", ok: false, error: `shots[${index}]: ${probe.error}` };
      }
    }
    const payloadHash = parseCameraHashValue(extracted.clipHash);
    const warningParts = [familyWarning(family, extracted.family)];
    if (payloadHash != null && payloadHash !== (pack.clipHash >>> 0)) {
      const taken = table.entries.some(
        (entry) =>
          (entry.clipHash >>> 0) === payloadHash &&
          !pack.shots.some((shot) => shot.entryIndex === entry.entryIndex),
      );
      if (taken) {
        return {
          format: "clip-json",
          ok: false,
          error: `Clip hash ${formatCameraHash(payloadHash)} is already used by another pack.`,
          clipHash: payloadHash,
        };
      }
      warningParts.push(`Clip hash will change to ${formatCameraHash(payloadHash)}. Point sys_53(0x4) at the new hash.`);
    }
    return {
      format: "clip-json",
      ok: true,
      shotCount: extracted.shots.length,
      fieldCount: extracted.shots.reduce((count, shot) => count + (isRecord(shot) ? Object.keys(shot).length : 0), 0),
      clipHash: payloadHash ?? pack.clipHash,
      warning: warningParts.filter(Boolean).join(" ") || undefined,
    };
  }

  const bytes = parseHexBytes(trimmed);
  if (bytes) {
    if (selectedEntryIndex == null) {
      return { format: "hex", ok: false, error: "No shot selected.", byteCount: bytes.length };
    }
    if (bytes.length !== CAMERA_TABLE_ENTRY_SIZE) {
      return {
        format: "hex",
        ok: false,
        error: `Expected ${CAMERA_TABLE_ENTRY_SIZE} bytes, found ${bytes.length}.`,
        byteCount: bytes.length,
      };
    }
    return { format: "hex", ok: true, byteCount: bytes.length };
  }

  return {
    format: "unknown",
    ok: false,
    error: "Unrecognized import data. Paste clip/shot JSON or 220 hex bytes.",
  };
}

function applyShotPatchToEntry(
  table: CameraTableData,
  entryIndex: number,
  patch: ParsedShotPatch,
): { ok: true; table: CameraTableData } | { ok: false; error: string } {
  const source = table.entriesRaw[entryIndex];
  if (!source) return { ok: false, error: "No shot selected." };
  const patched = patchRaw(source, table.fieldSpecs ?? [], patch);
  if (!patched.ok) return patched;
  return { ok: true, table: replaceCameraEntryRaw(table, entryIndex, patched.raw) };
}

export function applyCameraTableImport(
  text: string,
  table: CameraTableData,
  family: string,
  selectedEntryIndex: number | null,
  pack: CameraClipPack | null,
): CameraTableJsonApplyResult {
  const preview = previewCameraTableImport(text, table, family, selectedEntryIndex, pack);
  if (!preview.ok) return { ok: false, error: preview.error ?? "Import validation failed." };

  const trimmed = text.trim();
  if (preview.format === "hex") {
    if (selectedEntryIndex == null) return { ok: false, error: "No shot selected." };
    const bytes = parseHexBytes(trimmed);
    if (!bytes) return { ok: false, error: "No hex bytes found." };
    const next = replaceCameraEntryRaw(table, selectedEntryIndex, bytes);
    const entry = next.entries[selectedEntryIndex];
    return {
      ok: true,
      format: "hex",
      table: next,
      selection: { clipHash: entry?.clipHash ?? 0, entryId: entry?.entryId ?? 0 },
    };
  }

  const parsedJson = tryParseJson(trimmed);
  const extracted = extractPayload(parsedJson);
  if (!extracted) return { ok: false, error: "JSON does not contain a camera clip or shot object." };

  if (extracted.kind === "shot") {
    if (selectedEntryIndex == null) return { ok: false, error: "No shot selected." };
    const parsed = parseShotPatch(extracted.entry);
    if (!parsed.ok) return parsed;
    const applied = applyShotPatchToEntry(table, selectedEntryIndex, parsed.patch);
    if (!applied.ok) return applied;
    const entry = applied.table.entries[selectedEntryIndex];
    return {
      ok: true,
      format: "shot-json",
      table: applied.table,
      selection: { clipHash: entry?.clipHash ?? 0, entryId: entry?.entryId ?? 0 },
    };
  }

  if (!pack) return { ok: false, error: "No clip selected." };
  let next = table;
  for (let index = 0; index < extracted.shots.length; index += 1) {
    const shot = extracted.shots[index];
    if (!isRecord(shot)) return { ok: false, error: `shots[${index}] must be an object.` };
    const parsed = parseShotPatch(shot);
    if (!parsed.ok) return { ok: false, error: `shots[${index}]: ${parsed.error}` };
    const targetIndex = pack.shots[index]?.entryIndex;
    if (targetIndex == null) return { ok: false, error: `shots[${index}] has no target row.` };
    const applied = applyShotPatchToEntry(next, targetIndex, parsed.patch);
    if (!applied.ok) return { ok: false, error: `shots[${index}]: ${applied.error}` };
    next = applied.table;
  }
  const payloadHash = parseCameraHashValue(extracted.clipHash);
  if (payloadHash != null) {
    for (const shot of pack.shots) {
      const raw = writeCameraUintHash(
        next.entriesRaw[shot.entryIndex] ?? [],
        next.fieldSpecs,
        CAM_CMD.clipHash,
        payloadHash,
      );
      next = replaceCameraEntryRaw(next, shot.entryIndex, raw);
    }
  }
  const first = pack.shots[0];
  const firstNext = first ? next.entries.find((entry) => entry.entryIndex === first.entryIndex) : null;
  return {
    ok: true,
    format: "clip-json",
    table: next,
    selection: {
      clipHash: firstNext?.clipHash ?? payloadHash ?? pack.clipHash,
      entryId: firstNext?.entryId ?? first?.entryId ?? 0,
    },
  };
}

export function applyCameraTableJson(
  text: string,
  table: CameraTableData,
  family: string,
  selectedEntryIndex: number | null,
  pack: CameraClipPack | null,
): CameraTableJsonApplyResult {
  const preview = previewCameraTableImport(text, table, family, selectedEntryIndex, pack);
  if (preview.format === "hex") {
    return { ok: false, error: "JSON view does not accept hex bytes. Use Import for hex." };
  }
  return applyCameraTableImport(text, table, family, selectedEntryIndex, pack);
}

export function cloneCameraShotRow(
  table: CameraTableData,
  pack: CameraClipPack,
  source: CameraTableEntry,
  overlay?: Partial<CameraTableEntry>,
  fields?: Record<string, unknown> | null,
): CameraTableJsonApplyResult {
  const sourceRaw = table.entriesRaw[source.entryIndex];
  if (!sourceRaw) return { ok: false, error: "No shot selected." };
  const specs = table.fieldSpecs ?? [];
  const nextHash = overlay?.clipHash ?? source.clipHash;
  const sameClip = (nextHash >>> 0) === (pack.clipHash >>> 0);
  let sortKey = overlay?.sortKey;
  if (sortKey == null) {
    try {
      sortKey = allocateCameraSortKeys(table, 1, sameClip ? pack.sortKeyEnd : undefined)[0];
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  if (sortKey == null) return { ok: false, error: "Unable to allocate a sort key." };
  const firstShot = overlay?.firstShot ?? (sameClip ? 0 : source.firstShot);
  const patch: ParsedShotPatch = {
    overlay: {
      ...overlay,
      clipHash: nextHash,
      sortKey,
      firstShot,
    },
    fields: fields ?? null,
    hasChange: true,
  };
  const patched = patchRaw(sourceRaw, specs, patch);
  if (!patched.ok) return patched;
  const [entryId] = allocateCameraEntryIds(table, 1);
  if (entryId == null) return { ok: false, error: "Unable to allocate a row id." };
  const next = appendCameraEntries(table, [{ entryId, raw: patched.raw }]);
  const added = next.entries[next.entries.length - 1];
  return {
    ok: true,
    format: "shot-json",
    table: next,
    selection: {
      clipHash: added?.clipHash ?? nextHash,
      entryId: added?.entryId ?? entryId,
      clearSearch: !sameClip,
    },
  };
}

export function cloneCameraClipPackRows(
  table: CameraTableData,
  pack: CameraClipPack,
  requestedHash?: number,
): CameraTableJsonApplyResult {
  let clipHash = requestedHash;
  if (clipHash == null || clipHash === (pack.clipHash >>> 0)) {
    try {
      clipHash = unusedCameraClipHash(table, pack.clipHash);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  } else {
    const taken = table.entries.some((entry) => (entry.clipHash >>> 0) === clipHash);
    if (taken) {
      return { ok: false, error: `Clip hash ${formatCameraHash(clipHash)} is already used.` };
    }
  }
  const ids = allocateCameraEntryIds(table, pack.shots.length);
  let sorts: number[];
  try {
    sorts = allocateCameraSortKeys(table, pack.shots.length);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  const rows: Array<{ entryId: number; raw: number[] }> = [];
  for (let index = 0; index < pack.shots.length; index += 1) {
    const shot = pack.shots[index];
    const sourceRaw = table.entriesRaw[shot.entryIndex];
    if (!sourceRaw) return { ok: false, error: `Missing raw row for shot ${index}.` };
    const entryId = ids[index];
    const sortKey = sorts[index];
    if (entryId == null || sortKey == null) return { ok: false, error: "Unable to allocate a row id." };
    rows.push({
      entryId,
      raw: writeCameraUintHash(
        writeCameraUintHash(sourceRaw, table.fieldSpecs, CAM_CMD.clipHash, clipHash),
        table.fieldSpecs,
        CAM_CMD.sortKey,
        sortKey,
      ),
    });
  }
  const next = appendCameraEntries(table, rows);
  const added = next.entries[next.entries.length - rows.length];
  return {
    ok: true,
    format: "clip-json",
    table: next,
    selection: {
      clipHash,
      entryId: added?.entryId ?? ids[0] ?? 0,
      clearSearch: true,
    },
  };
}

export function cloneCameraTableFromJson(
  text: string,
  table: CameraTableData,
  family: string,
  selectedEntryIndex: number | null,
  pack: CameraClipPack | null,
): CameraTableJsonApplyResult {
  const trimmed = text.trim();
  const parsedJson = tryParseJson(trimmed);
  const extracted = extractPayload(parsedJson);
  if (!extracted) {
    const preview = previewCameraTableImport(trimmed, table, family, selectedEntryIndex, pack);
    if (preview.format === "hex") {
      return { ok: false, error: "JSON view does not accept hex bytes. Use Import for hex." };
    }
    return { ok: false, error: preview.error ?? "JSON does not contain a camera clip or shot object." };
  }
  const typeError = fileTypeError(extracted.fileType);
  if (typeError) return { ok: false, error: typeError };

  if (extracted.kind === "shot") {
    if (!pack || selectedEntryIndex == null) return { ok: false, error: "No shot selected." };
    const source =
      table.entries.find((entry) => entry.entryIndex === selectedEntryIndex) ?? table.entries[selectedEntryIndex];
    if (!source) return { ok: false, error: "No shot selected." };
    const parsed = parseShotPatch(extracted.entry);
    if (!parsed.ok) return parsed;
    return cloneCameraShotRow(table, pack, source, parsed.patch.overlay, parsed.patch.fields);
  }

  if (!pack) return { ok: false, error: "No clip selected." };
  if (extracted.shots.length !== pack.shots.length) {
    return {
      ok: false,
      error: `Shot count ${extracted.shots.length} != pack ${pack.shots.length}. Clone uses the selected clip's row count.`,
    };
  }
  let working = table;
  const specs = table.fieldSpecs ?? [];
  const requestedHash = parseCameraHashValue(extracted.clipHash);
  const ids = allocateCameraEntryIds(working, pack.shots.length);
  let sorts: number[];
  try {
    sorts = allocateCameraSortKeys(working, pack.shots.length);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  let clipHash = requestedHash;
  if (clipHash == null || clipHash === (pack.clipHash >>> 0)) {
    try {
      clipHash = unusedCameraClipHash(working, pack.clipHash);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  } else {
    const taken = working.entries.some((entry) => (entry.clipHash >>> 0) === clipHash);
    if (taken) return { ok: false, error: `Clip hash ${formatCameraHash(clipHash)} is already used.` };
  }

  const rows: Array<{ entryId: number; raw: number[] }> = [];
  for (let index = 0; index < extracted.shots.length; index += 1) {
    const shot = extracted.shots[index];
    if (!isRecord(shot)) return { ok: false, error: `shots[${index}] must be an object.` };
    const parsed = parseShotPatch(shot);
    if (!parsed.ok) return { ok: false, error: `shots[${index}]: ${parsed.error}` };
    const sourceRaw = working.entriesRaw[pack.shots[index]?.entryIndex ?? -1];
    if (!sourceRaw) return { ok: false, error: `Missing raw row for shot ${index}.` };
    const patched = patchRaw(sourceRaw, specs, parsed.patch);
    if (!patched.ok) return { ok: false, error: `shots[${index}]: ${patched.error}` };
    const entryId = ids[index];
    const sortKey = sorts[index];
    if (entryId == null || sortKey == null) return { ok: false, error: "Unable to allocate a row id." };
    rows.push({
      entryId,
      raw: writeCameraUintHash(
        writeCameraUintHash(patched.raw, specs, CAM_CMD.clipHash, clipHash),
        specs,
        CAM_CMD.sortKey,
        sortKey,
      ),
    });
  }
  const next = appendCameraEntries(working, rows);
  const added = next.entries[next.entries.length - rows.length];
  return {
    ok: true,
    format: "clip-json",
    table: next,
    selection: {
      clipHash,
      entryId: added?.entryId ?? ids[0] ?? 0,
      clearSearch: true,
    },
  };
}
