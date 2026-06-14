import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { exists, readDir, readFile, readTextFile, stat } from "@tauri-apps/plugin-fs";
import type { SsbhModelPreviewContextValue } from "@/components/ssbh-model-preview/SsbhModelPreviewContext";
import type {
  SsbhModelPreviewBundle,
  SsbhModelPreviewInstance,
} from "@/components/ssbh-model-preview/types";
import type { NutexbTextureData } from "@/page/SceneEdit/hooks/useSceneTextureLoader";
import type { UnitModelTextureInventory } from "./unitModelTextureService";
import type {
  UnitModelRepackResult,
  UnitModelValidationResult,
} from "./unitModelRepackService";

const ASSET_PARSE_CONCURRENCY = 4;

const REVIEW_ASSET_EXTENSIONS = new Set([
  "numdlb",
  "numshb",
  "nusktb",
  "numatb",
  "nutexb",
  "jnttbl",
  "nuhlpb",
  "shl",
  "nuanmb",
  "numleb",
  "numvisb",
  "numtbb",
]);

const SSBH_JSON_EXTENSIONS = new Set(["numdlb", "numshb", "nusktb", "numatb"]);

const UNIT_MODEL_VALIDATION_RULES = [
  {
    phase: "input",
    checks: [
      "Selected unit model root must be an existing directory.",
      "A sibling *_structure.json must be resolvable from the selected model root unless explicitly supplied.",
    ],
  },
  {
    phase: "structure",
    checks: [
      "Structure JSON must exist and parse successfully.",
      "Fhm2dTotalCount must match SubFileData length when present.",
      "SubFileData fileIndex values must be unique.",
      "SubFileStructure folders must have valid folderCount values and closing EndMark entries.",
      "Structure items must reference existing SubFileData fileIndex values.",
    ],
  },
  {
    phase: "models",
    checks: [
      "At least one unit SSBH model group must be found.",
      "Each model group must contain exactly one .nusktb, .numshb, .numdlb, and .jnttbl.",
      "Each model group must contain both __maya__.numatb and __nust__.numatb material files.",
    ],
  },
  {
    phase: "files",
    checks: ["Every file referenced by SubFileData and validated model groups must exist on disk."],
  },
  {
    phase: "textures",
    checks: [
      "Each model group must have exactly two texture container folders.",
      "Texture containers may contain only .nutexb items.",
      "Each texture container must be followed by its paired .numatb item.",
      "Every non-empty texture reference in the paired .numatb must exist in that container.",
    ],
  },
  {
    phase: "numatb",
    checks: ["Paired .numatb files must read successfully and expose material texture references."],
  },
  {
    phase: "nuhlpb",
    checks: [".nuhlpb count must match the number of model groups."],
  },
  {
    phase: "shl",
    checks: [
      "Legacy shell_*.shl entries are reported as warnings only.",
      "Missing or stale .shl files do not block Unit Model validation because they are not part of the native Unit folder layout.",
    ],
  },
  {
    phase: "unk",
    checks: [
      "Model folders must use unk3=0 and unk5=0.",
      "Texture container folders must use unk3=32 and unk5=1.",
      "Known item types must use their expected unk2 values, and non-numatb items must use unk3=0.",
    ],
  },
] as const;

type ReviewAssetFile = {
  path: string;
  relativePath: string;
  filename: string;
  extension: string;
  sizeBytes: number | null;
  modifiedAtMs: number | null;
};

type ParsedReviewAsset = ReviewAssetFile & {
  parseStatus: "parsed" | "metadata-only" | "error";
  parseCommand: string | null;
  parsedData: unknown;
  parseError: string | null;
};

export interface BuildUnitModelAiReviewPayloadOptions {
  activeModelRoot: string | null;
  structurePath: string | null;
  validation: UnitModelValidationResult | null;
  lastRepack: UnitModelRepackResult | null;
  preview: SsbhModelPreviewContextValue;
  textureInventory: UnitModelTextureInventory | null;
}

function isNativePath(path: string | null): path is string {
  return Boolean(path && !/^[a-z]+:\/\//i.test(path));
}

function normalizePathKey(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/g, "").toLowerCase();
}

function filenameFromPath(path: string): string {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? path;
}

function extensionFromPath(path: string): string {
  const name = filenameFromPath(path);
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function relativeToRoot(root: string, path: string): string {
  const rootKey = normalizePathKey(root);
  const pathKey = normalizePathKey(path);
  if (pathKey === rootKey) return ".";
  if (pathKey.startsWith(`${rootKey}/`)) {
    return path.replace(/\\/g, "/").slice(root.replace(/\\/g, "/").replace(/\/+$/g, "").length + 1);
  }
  return path;
}

function safeJsonValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof ArrayBuffer) {
    return { kind: "ArrayBuffer", byteLength: value.byteLength };
  }
  if (ArrayBuffer.isView(value)) {
    return {
      kind: value.constructor.name,
      byteLength: value.byteLength,
      length: "length" in value ? (value as { length: number }).length : undefined,
    };
  }
  if (Array.isArray(value)) {
    return value.map((item) => safeJsonValue(item, seen));
  }
  if (value instanceof Map) {
    return Array.from(value.entries()).map(([key, mapValue]) => ({
      key: safeJsonValue(key, seen),
      value: safeJsonValue(mapValue, seen),
    }));
  }
  if (value instanceof Set) {
    return Array.from(value.values()).map((item) => safeJsonValue(item, seen));
  }
  if (typeof value === "object") {
    if (seen.has(value)) {
      return { kind: "CircularReference" };
    }
    seen.add(value);
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (typeof child === "function") continue;
      out[key] = safeJsonValue(child, seen);
    }
    seen.delete(value);
    return out;
  }
  return String(value);
}

function maybeArrayLength(value: unknown, key: string): number {
  if (!value || typeof value !== "object") return 0;
  const child = (value as Record<string, unknown>)[key];
  return Array.isArray(child) ? child.length : 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getString(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") return value;
  }
  return null;
}

function getNumber(record: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function getBoolean(record: Record<string, unknown>, ...keys: string[]): boolean | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
  }
  return null;
}

function getRecordArray(record: Record<string, unknown>, ...keys: string[]): Record<string, unknown>[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is Record<string, unknown> => Boolean(asRecord(item)));
    }
  }
  return [];
}

function getDataPayload(value: unknown): {
  envelope: Record<string, unknown> | null;
  data: Record<string, unknown> | null;
} {
  const envelope = asRecord(value);
  const nested = envelope ? asRecord(envelope.data) : null;
  return {
    envelope,
    data: nested ?? envelope,
  };
}

function vectorDataCount(data: unknown): number | null {
  if (Array.isArray(data)) return data.length;
  const record = asRecord(data);
  if (!record) return null;
  for (const value of Object.values(record)) {
    if (Array.isArray(value)) return value.length;
  }
  return null;
}

function vectorDataKind(data: unknown): string | null {
  if (Array.isArray(data)) return "Array";
  const record = asRecord(data);
  if (!record) return null;
  return Object.keys(record)[0] ?? null;
}

function summarizeMeshAttributes(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((attribute) => {
    const record = asRecord(attribute);
    if (!record) {
      return {
        name: null,
        dataKind: null,
        count: null,
      };
    }
    return {
      name: getString(record, "name"),
      dataKind: vectorDataKind(record.data),
      count: vectorDataCount(record.data),
    };
  });
}

function summarizeBoneInfluences(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((influence) => {
    const record = asRecord(influence) ?? {};
    const weights = record.vertex_weights ?? record.vertexWeights;
    return {
      boneName: getString(record, "bone_name", "boneName"),
      vertexWeightCount: Array.isArray(weights) ? weights.length : 0,
    };
  });
}

function summarizeBinarySlice(value: unknown) {
  const record = asRecord(value);
  if (!record) return null;
  return {
    offset: getNumber(record, "offset"),
    count: getNumber(record, "count"),
    components: getNumber(record, "components"),
  };
}

function summarizeMeshObject(object: Record<string, unknown>) {
  const binaryHeader = {
    vertexCount: getNumber(object, "vertexCount"),
    indexCount: getNumber(object, "indexCount"),
    positions: summarizeBinarySlice(object.positions),
    normals: summarizeBinarySlice(object.normals),
    uv0: summarizeBinarySlice(object.uv0),
    uv1: summarizeBinarySlice(object.uv1),
    indices: summarizeBinarySlice(object.indices),
  };
  const vertexIndices = object.vertex_indices ?? object.vertexIndices;
  const positionAttrs = summarizeMeshAttributes(object.positions);
  const normalAttrs = summarizeMeshAttributes(object.normals);
  const uvAttrs = summarizeMeshAttributes(object.texture_coordinates ?? object.textureCoordinates);
  const firstPositionCount = positionAttrs.find((attr) => typeof attr.count === "number")?.count ?? null;

  return {
    name: getString(object, "name"),
    subindex: getNumber(object, "subindex"),
    parentBoneName: getString(object, "parent_bone_name", "parentBoneName"),
    vertexCount:
      binaryHeader.vertexCount ??
      firstPositionCount ??
      null,
    indexCount:
      binaryHeader.indexCount ??
      (Array.isArray(vertexIndices) ? vertexIndices.length : null),
    attributeSummary: {
      positions: positionAttrs,
      normals: normalAttrs,
      textureCoordinates: uvAttrs,
    },
    binaryGeometry: {
      present: Boolean(object.__bin) || Boolean(object.geometryId) || Boolean(binaryHeader.vertexCount),
      slices: binaryHeader,
    },
    boneInfluences: summarizeBoneInfluences(object.bone_influences ?? object.boneInfluences),
  };
}

function summarizeMeshData(value: unknown) {
  const { envelope, data } = getDataPayload(value);
  if (!data) return safeJsonValue(value);
  const objects = getRecordArray(data, "objects");
  if (objects.length === 0) return safeJsonValue(value);

  return {
    filePath: getString(envelope ?? {}, "filePath"),
    format: getString(envelope ?? {}, "format") ?? "numshb",
    summary: {
      majorVersion: getNumber(data, "major_version", "majorVersion"),
      minorVersion: getNumber(data, "minor_version", "minorVersion"),
      isVs2: getBoolean(data, "is_vs2", "isVs2"),
      binary: getBoolean(data, "binary"),
      geometryId: getString(data, "geometryId"),
      objectCount: objects.length,
      note: "Mesh payload is summarized; vertex/index/normal/UV arrays are intentionally omitted.",
    },
    objects: objects.map(summarizeMeshObject),
  };
}

function summarizeSkeletonData(value: unknown) {
  const { envelope, data } = getDataPayload(value);
  if (!data) return safeJsonValue(value);
  const bones = getRecordArray(data, "bones");
  if (bones.length === 0) return safeJsonValue(value);

  return {
    filePath: getString(envelope ?? {}, "filePath"),
    format: getString(envelope ?? {}, "format") ?? "nusktb",
    summary: {
      boneCount: bones.length,
      note: "Skeleton payload is summarized; bone transform matrices are intentionally omitted.",
    },
    bones: bones.map((bone, index) => ({
      index,
      name: getString(bone, "name"),
      parentIndex: getNumber(bone, "parent_index", "parentIndex"),
      billboardType: safeJsonValue(bone.billboard_type ?? bone.billboardType ?? null),
      hasTransform: Boolean(bone.transform),
    })),
  };
}

function summarizeJnttblData(value: unknown) {
  const record = asRecord(value);
  if (!record) return safeJsonValue(value);
  return {
    version: record.version,
    boneCount: record.boneCount,
    flag: record.flag,
    byteLength: record.byteLength,
    entries: safeJsonValue(record.entries),
    nusktb: safeJsonValue(record.nusktb),
    hexDumpOmitted: typeof record.hexDump === "string",
  };
}

function summarizeSsbhPayload(value: unknown, extension: string) {
  if (extension === "numshb") return summarizeMeshData(value);
  if (extension === "nusktb") return summarizeSkeletonData(value);
  return safeJsonValue(value);
}

function bundleSummary(bundle: SsbhModelPreviewBundle) {
  return {
    modlEntryCount: maybeArrayLength(bundle.modl, "entries"),
    meshObjectCount: maybeArrayLength(bundle.mesh, "objects"),
    skelBoneCount: bundle.skel ? maybeArrayLength(bundle.skel, "bones") : 0,
    matlEntryCount: bundle.matl ? maybeArrayLength(bundle.matl, "entries") : 0,
    mayaMatlEntryCount: bundle.matlProfiles?.maya
      ? maybeArrayLength(bundle.matlProfiles.maya, "entries")
      : 0,
    nustMatlEntryCount: bundle.matlProfiles?.nust
      ? maybeArrayLength(bundle.matlProfiles.nust, "entries")
      : 0,
    textureRefCount: bundle.textureRefs.length,
    resolvedNutexbPathCount: bundle.resolvedNutexbPaths.length,
    warningCount: bundle.warnings.length,
  };
}

function serializeBundle(bundle: SsbhModelPreviewBundle) {
  return {
    summary: bundleSummary(bundle),
    rootFolder: bundle.rootFolder,
    modlPath: bundle.modlPath,
    meshPath: bundle.meshPath,
    skelPath: bundle.skelPath,
    matlPaths: bundle.matlPaths,
    sourceKind: bundle.sourceKind,
    sourceSessionId: bundle.sourceSessionId ?? null,
    virtualModlPath: bundle.virtualModlPath ?? null,
    textureRefs: bundle.textureRefs,
    resolvedNutexbPaths: bundle.resolvedNutexbPaths,
    textureResolve: bundle.textureResolve,
    warnings: bundle.warnings,
    modl: safeJsonValue(bundle.modl),
    mesh: summarizeMeshData(bundle.mesh),
    skel: summarizeSkeletonData(bundle.skel),
    matl: safeJsonValue(bundle.matl),
    matlProfiles: safeJsonValue(bundle.matlProfiles ?? null),
  };
}

function serializePreviewInstance(instance: SsbhModelPreviewInstance) {
  return {
    id: instance.id,
    displayLabel: instance.displayLabel,
    modlPath: instance.modlPath,
    bundle: serializeBundle(instance.bundle),
  };
}

function summarizeTextureData([key, data]: [string, NutexbTextureData]) {
  const base = {
    key,
    kind: data.kind,
    width: data.width,
    height: data.height,
  };
  if (data.kind === "compressed") {
    return {
      ...base,
      formatId: data.formatId,
      byteLength: data.data.byteLength,
    };
  }
  return {
    ...base,
    byteLength: data.rgba.byteLength,
  };
}

function summarizeDraw(draw: SsbhModelPreviewContextValue["draws"][number]) {
  const position = draw.geometry.getAttribute("position");
  const normal = draw.geometry.getAttribute("normal");
  const uv = draw.geometry.getAttribute("uv");
  return {
    key: draw.key,
    label: draw.label,
    previewInstanceId: draw.previewInstanceId ?? null,
    materialLabel: draw.materialLabel,
    meshObjectName: draw.meshObjectName,
    meshObjectSubindex: draw.meshObjectSubindex,
    vertexCount: position?.count ?? 0,
    normalCount: normal?.count ?? 0,
    uvCount: uv?.count ?? 0,
    indexCount: draw.geometry.index?.count ?? 0,
    hasSkin: Boolean(draw.skin),
    skin: draw.skin
      ? {
          boneCount: draw.skin.boneCount,
          bindPositionByteLength: draw.skin.bindPositions.byteLength,
          boneIndexByteLength: draw.skin.boneIndices.byteLength,
          boneWeightByteLength: draw.skin.boneWeights.byteLength,
          gpuAttributesReady: draw.skin.gpuAttributesReady,
        }
      : null,
  };
}

function validationJudgement(validation: UnitModelValidationResult | null) {
  const errorsByPhase = new Map<string, number>();
  for (const error of validation?.errors ?? []) {
    errorsByPhase.set(error.phase, (errorsByPhase.get(error.phase) ?? 0) + 1);
  }
  return {
    status: validation ? (validation.valid ? "pass" : "fail") : "not-run",
    blockingErrorCount: validation?.errors.length ?? null,
    warningCount: validation?.warnings.length ?? null,
    phases: UNIT_MODEL_VALIDATION_RULES.map((rule) => ({
      phase: rule.phase,
      status: !validation
        ? "not-run"
        : errorsByPhase.has(rule.phase)
          ? "failed"
          : "no-errors-reported",
      reportedErrorCount: errorsByPhase.get(rule.phase) ?? 0,
      checks: rule.checks,
    })),
  };
}

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const run = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      out[index] = await worker(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return out;
}

async function listReviewAssetFiles(root: string): Promise<ReviewAssetFile[]> {
  const rootExists = await exists(root);
  if (!rootExists) return [];

  const out: ReviewAssetFile[] = [];
  const walk = async (dir: string) => {
    const entries = await readDir(dir);
    for (const entry of entries) {
      const path = await join(dir, entry.name);
      if (entry.isDirectory) {
        await walk(path);
        continue;
      }
      const extension = extensionFromPath(entry.name);
      if (!REVIEW_ASSET_EXTENSIONS.has(extension)) continue;
      let sizeBytes: number | null = null;
      let modifiedAtMs: number | null = null;
      try {
        const fileStat = await stat(path);
        sizeBytes = Number(fileStat.size);
        modifiedAtMs = fileStat.mtime ? Number(fileStat.mtime) : null;
      } catch {
        sizeBytes = null;
        modifiedAtMs = null;
      }
      out.push({
        path,
        relativePath: relativeToRoot(root, path),
        filename: entry.name,
        extension,
        sizeBytes,
        modifiedAtMs,
      });
    }
  };
  await walk(root);
  out.sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { sensitivity: "base" }));
  return out;
}

async function readStructureJson(structurePath: string | null) {
  if (!isNativePath(structurePath) || !(await exists(structurePath))) {
    return {
      path: structurePath,
      exists: false,
      data: null,
      parseError: structurePath ? "Structure JSON path does not exist." : "No structure JSON path.",
    };
  }
  try {
    const raw = await readTextFile(structurePath);
    return {
      path: structurePath,
      exists: true,
      data: JSON.parse(raw) as unknown,
      parseError: null,
    };
  } catch (error) {
    return {
      path: structurePath,
      exists: true,
      data: null,
      parseError: String(error),
    };
  }
}

function parseShlHeader(bytes: Uint8Array) {
  const magic = Array.from(bytes.slice(0, 4))
    .map((value) => String.fromCharCode(value))
    .join("");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    magic,
    byteLength: bytes.byteLength,
    declaredModelCount: bytes.byteLength >= 0x10 ? view.getUint32(0x0c, true) : null,
  };
}

async function parseReviewAsset(file: ReviewAssetFile): Promise<ParsedReviewAsset> {
  try {
    if (SSBH_JSON_EXTENSIONS.has(file.extension)) {
      const parsedData = await invoke("ssbh_load_ssbh_file_as_json", { path: file.path });
      const summarized = file.extension === "numshb" || file.extension === "nusktb";
      return {
        ...file,
        parseStatus: "parsed",
        parseCommand: summarized
          ? "ssbh_load_ssbh_file_as_json:summarized"
          : "ssbh_load_ssbh_file_as_json",
        parsedData: summarizeSsbhPayload(parsedData, file.extension),
        parseError: null,
      };
    }
    if (file.extension === "jnttbl") {
      const parsedData = await invoke("jnttbl_read_file", { filePath: file.path });
      return {
        ...file,
        parseStatus: "parsed",
        parseCommand: "jnttbl_read_file:summarized",
        parsedData: summarizeJnttblData(parsedData),
        parseError: null,
      };
    }
    if (file.extension === "nutexb") {
      const parsedData = await invoke("nutexb_read_info", { inputPath: file.path });
      return {
        ...file,
        parseStatus: "parsed",
        parseCommand: "nutexb_read_info",
        parsedData: safeJsonValue(parsedData),
        parseError: null,
      };
    }
    if (file.extension === "shl") {
      const bytes = await readFile(file.path);
      return {
        ...file,
        parseStatus: "parsed",
        parseCommand: "readFile:shl-header",
        parsedData: parseShlHeader(bytes),
        parseError: null,
      };
    }
    return {
      ...file,
      parseStatus: "metadata-only",
      parseCommand: null,
      parsedData: null,
      parseError: null,
    };
  } catch (error) {
    return {
      ...file,
      parseStatus: "error",
      parseCommand: null,
      parsedData: null,
      parseError: String(error),
    };
  }
}

function buildPreviewSnapshot(preview: SsbhModelPreviewContextValue) {
  return {
    workspaceRoot: preview.workspaceRoot,
    activePreviewInstanceId: preview.activePreviewInstanceId,
    previewViewMode: preview.previewViewMode,
    previewControlScope: preview.previewControlScope,
    previewCollectionItems: safeJsonValue(preview.previewCollectionItems),
    previewCollectionQuery: preview.previewCollectionQuery,
    selectedPreviewInstanceIds: Array.from(preview.selectedPreviewInstanceIds),
    hiddenPreviewInstanceIds: Array.from(preview.hiddenPreviewInstanceIds),
    previewCollectionAllVisible: preview.previewCollectionAllVisible,
    visibleDrawKeys: Array.from(preview.visibleKeys),
    rendering: {
      renderStyle: preview.previewRenderStyle,
      wireframe: preview.wireframe,
      showSkeleton: preview.showSkeleton,
      showGrid: preview.showGrid,
      showAxesGizmo: preview.showAxesGizmo,
      showStats: preview.showStats,
      background: preview.background,
      ambientIntensity: preview.ambientIntensity,
      directionalIntensity: preview.directionalIntensity,
      directional: {
        x: preview.directionalX,
        y: preview.directionalY,
        z: preview.directionalZ,
      },
      normalMapEnabled: preview.normalMapEnabled,
      textureFlipY: preview.textureFlipY,
      uvFlipU: preview.uvFlipU,
      uvFlipV: preview.uvFlipV,
      textureSlotLoadEnabled: preview.textureSlotLoadEnabled,
      materialDebugViewMode: preview.materialDebugViewMode,
    },
    boneSelection: {
      selectedBoneIndex: preview.selectedBoneIndex,
      bonePointSize: preview.bonePointSize,
      boneTransformMode: preview.boneTransformMode,
      canUndoBonePose: preview.canUndoBonePose,
      canRedoBonePose: preview.canRedoBonePose,
    },
    motion: {
      nuanmbPaths: preview.motionNuanmbPaths,
      selectedNuanmbPath: preview.motionSelectedNuanmbPath,
      playing: preview.motionPlaying,
      loop: preview.motionLoop,
      speed: preview.motionSpeed,
      frame: preview.motionFrame,
      manifest: safeJsonValue(preview.motionManifest),
      clip: safeJsonValue(preview.motionClip),
      sample: safeJsonValue(preview.motionSample),
      sampleError: preview.motionSampleError,
      applyCamera: preview.motionApplyCamera,
      applyLighting: preview.motionApplyLighting,
      forceVisibleDuringPlayback: preview.motionForceVisibleDuringPlayback,
      motionStatesByInstanceId: safeJsonValue(preview.motionStatesByInstanceId),
    },
    loadState: {
      loading: preview.loading,
      previewBusy: preview.previewBusy,
      loadError: preview.loadError,
      drawError: preview.drawError,
      textureDecoding: preview.textureDecoding,
      textureDecodeProgress: preview.textureDecodeProgress,
    },
    vertexTriangleStats: preview.vertexTriangleStats,
    instances: preview.previewInstances.map(serializePreviewInstance),
    primaryBundle: preview.bundle ? serializeBundle(preview.bundle) : null,
    draws: preview.draws.map(summarizeDraw),
    materialBindingsByDrawKey: Array.from(preview.drawMaterialBindingsByDrawKey.entries()).map(
      ([drawKey, binding]) => ({
        drawKey,
        binding: safeJsonValue(binding),
      }),
    ),
    decodedTextures: Array.from(preview.textureDataMap.entries()).map(summarizeTextureData),
  };
}

export async function buildUnitModelAiReviewPayload({
  activeModelRoot,
  structurePath,
  validation,
  lastRepack,
  preview,
  textureInventory,
}: BuildUnitModelAiReviewPayloadOptions): Promise<string> {
  const structureJson = await readStructureJson(structurePath);
  const diskAssets =
    isNativePath(activeModelRoot)
      ? await mapLimit(
          await listReviewAssetFiles(activeModelRoot),
          ASSET_PARSE_CONCURRENCY,
          parseReviewAsset,
        )
      : [];

  const payload = {
    kind: "unit-model-ai-review-payload",
    version: 3,
    generatedAt: new Date().toISOString(),
    compaction: {
      numshb: "Mesh geometry arrays are omitted; object metadata, attribute counts, index counts, and bone influence counts are retained.",
      nusktb: "Bone transform matrices are omitted; bone names, parent indices, billboard type, and transform presence are retained.",
      jnttbl: "Hex dump is omitted; entries and nusktb probe metadata are retained.",
    },
    activeModelRoot,
    structurePath,
    outputPath: lastRepack?.outputPath ?? null,
    lastRepack,
    validation: {
      logicSource: "src-tauri/src/format/unit_model_validate.rs::validate_unit_model_for_repack",
      rules: UNIT_MODEL_VALIDATION_RULES,
      judgement: validationJudgement(validation),
      result: validation,
    },
    loadedSceneData: {
      structureJson,
      unitTextureInventory: textureInventory,
      preview: buildPreviewSnapshot(preview),
      diskAssets,
    },
  };

  return JSON.stringify(safeJsonValue(payload), null, 2);
}
