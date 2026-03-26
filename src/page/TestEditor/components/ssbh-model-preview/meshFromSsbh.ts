import { BufferAttribute, BufferGeometry } from "three";
import type {
  MatlDataJson,
  MatlEntryJson,
  MeshDataJson,
  MeshObjectJson,
  MeshSkinRuntime,
  ModlDataJson,
  ModlEntryJson,
  SkelDataJson,
  VectorDataJson,
  BuiltMeshDraw,
} from "./types";

function vectorDataToVec3(data: VectorDataJson | undefined): [number, number, number][] | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (Array.isArray(d.Vector3)) return d.Vector3 as [number, number, number][];
  return null;
}

function vectorDataToVec2(data: VectorDataJson | undefined): [number, number][] | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (Array.isArray(d.Vector2)) return d.Vector2 as [number, number][];
  return null;
}

function normalizeParamId(paramId: unknown): string {
  if (typeof paramId === "string") return paramId;
  if (paramId && typeof paramId === "object") {
    const keys = Object.keys(paramId as object);
    if (keys.length === 1) return keys[0] ?? "";
  }
  return "";
}

function pickAlbedoTextureRef(entry: MatlEntryJson | undefined): string | null {
  if (!entry) return null;
  const priority = ["Texture0", "Texture4", "Texture6", "Texture7"];
  for (const id of priority) {
    const tex = entry.textures.find((t) => normalizeParamId(t.param_id) === id);
    const data = tex?.data?.trim();
    if (data) return data;
  }
  const any = entry.textures.find((t) => t.data?.trim());
  return any?.data?.trim() ?? null;
}

function findMeshObject(
  objects: MeshObjectJson[],
  entry: ModlEntryJson,
): MeshObjectJson | undefined {
  return objects.find(
    (o) => o.name === entry.mesh_object_name && o.subindex === entry.mesh_object_subindex,
  );
}

function boneNameToIndex(skel: SkelDataJson): Map<string, number> {
  const m = new Map<string, number>();
  skel.bones.forEach((b, i) => m.set(b.name, i));
  return m;
}

function buildLogicalSkinTable(
  vertexCount: number,
  influences: NonNullable<MeshObjectJson["bone_influences"]>,
  nameToIndex: Map<string, number>,
): { idx: Uint16Array; w: Float32Array } | null {
  const idx = new Uint16Array(vertexCount * 4);
  const w = new Float32Array(vertexCount * 4);
  const lists: { bi: number; wt: number }[][] = Array.from({ length: vertexCount }, () => []);
  for (const inf of influences) {
    const bi = nameToIndex.get(inf.bone_name);
    if (bi === undefined) continue;
    for (const vw of inf.vertex_weights) {
      const vi = vw.vertex_index;
      if (vi < 0 || vi >= vertexCount) continue;
      const wt = vw.vertex_weight;
      if (wt > 0 && Number.isFinite(wt)) {
        lists[vi]!.push({ bi, wt });
      }
    }
  }
  let any = false;
  for (let vi = 0; vi < vertexCount; vi++) {
    const arr = lists[vi]!.filter((x) => x.wt > 0).sort((a, b) => b.wt - a.wt).slice(0, 4);
    if (arr.length === 0) continue;
    any = true;
    const sum = arr.reduce((s, x) => s + x.wt, 0);
    const n = sum > 1e-10 ? 1 / sum : 0;
    for (let k = 0; k < 4; k++) {
      if (k < arr.length) {
        idx[vi * 4 + k] = arr[k]!.bi;
        w[vi * 4 + k] = arr[k]!.wt * n;
      } else {
        idx[vi * 4 + k] = 0;
        w[vi * 4 + k] = 0;
      }
    }
  }
  if (!any) return null;
  return { idx, w };
}

function buildGeometryForObject(
  obj: MeshObjectJson,
  skel: SkelDataJson | null | undefined,
): { geometry: BufferGeometry; skin: MeshSkinRuntime | null } {
  const indices = obj.vertex_indices;
  if (indices.length % 3 !== 0) {
    throw new Error(
      `Mesh "${obj.name}" subindex ${obj.subindex}: vertex_indices length must be a multiple of 3`,
    );
  }
  const posAttr = obj.positions[0];
  const positions = vectorDataToVec3(posAttr?.data);
  if (!positions?.length) {
    throw new Error(`Mesh "${obj.name}" subindex ${obj.subindex}: missing Position attribute`);
  }
  const logicalCount = positions.length;
  const nAttr = obj.normals[0];
  const normals = nAttr ? vectorDataToVec3(nAttr.data) : null;
  const uvAttr = obj.texture_coordinates[0];
  const uvs = uvAttr ? vectorDataToVec2(uvAttr.data) : null;

  const nameToIndex = skel ? boneNameToIndex(skel) : null;
  const logicalSkin =
    skel && nameToIndex && obj.bone_influences?.length
      ? buildLogicalSkinTable(logicalCount, obj.bone_influences, nameToIndex)
      : null;

  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const bindPositions = new Float32Array(indices.length * 3);
  const boneIndices = logicalSkin ? new Uint16Array(indices.length * 4) : new Uint16Array(0);
  const boneWeights = logicalSkin ? new Float32Array(indices.length * 4) : new Float32Array(0);

  for (let i = 0; i < indices.length; i++) {
    const vi = indices[i]!;
    const p = positions[vi];
    if (!p) {
      throw new Error(
        `Mesh "${obj.name}" subindex ${obj.subindex}: vertex index ${vi} out of range`,
      );
    }
    pos.push(p[0], p[1], p[2]);
    bindPositions[i * 3] = p[0];
    bindPositions[i * 3 + 1] = p[1];
    bindPositions[i * 3 + 2] = p[2];
    if (logicalSkin) {
      const o = vi * 4;
      for (let k = 0; k < 4; k++) {
        boneIndices[i * 4 + k] = logicalSkin.idx[o + k]!;
        boneWeights[i * 4 + k] = logicalSkin.w[o + k]!;
      }
    }
    if (normals?.[vi]) {
      nrm.push(normals[vi][0], normals[vi][1], normals[vi][2]);
    }
    if (uvs?.[vi]) {
      uv.push(uvs[vi][0], uvs[vi][1]);
    }
  }

  const geom = new BufferGeometry();
  geom.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  if (nrm.length === pos.length) {
    geom.setAttribute("normal", new BufferAttribute(new Float32Array(nrm), 3));
  } else {
    geom.computeVertexNormals();
  }
  if (uv.length === indices.length * 2) {
    geom.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
  }

  let skin: MeshSkinRuntime | null = null;
  if (logicalSkin && skel) {
    skin = {
      boneCount: skel.bones.length,
      bindPositions,
      boneIndices,
      boneWeights,
    };
  }

  return { geometry: geom, skin };
}

export function buildDrawListFromBundle(
  modl: ModlDataJson,
  mesh: MeshDataJson,
  skel?: SkelDataJson | null,
): BuiltMeshDraw[] {
  const objects = mesh.objects;
  const out: BuiltMeshDraw[] = [];
  for (const entry of modl.entries) {
    const obj = findMeshObject(objects, entry);
    if (!obj) {
      throw new Error(
        `Modl entry references missing mesh object "${entry.mesh_object_name}" subindex ${entry.mesh_object_subindex}`,
      );
    }
    const key = `${entry.mesh_object_name}_${entry.mesh_object_subindex}`;
    const label = `${entry.mesh_object_name} [${entry.mesh_object_subindex}]`;
    const { geometry, skin } = buildGeometryForObject(obj, skel ?? null);
    out.push({
      key,
      label,
      geometry,
      materialLabel: entry.material_label,
      meshObjectName: entry.mesh_object_name,
      meshObjectSubindex: entry.mesh_object_subindex,
      skin,
    });
  }
  return out;
}

export function buildMatlLookup(matl: MatlDataJson | null | undefined): Map<string, MatlEntryJson> {
  const map = new Map<string, MatlEntryJson>();
  if (!matl?.entries) return map;
  for (const e of matl.entries) {
    map.set(e.material_label, e);
  }
  return map;
}

export function resolveTexturePathForMaterial(
  materialLabel: string,
  matlLookup: Map<string, MatlEntryJson>,
  refToPath: Map<string, string>,
): string | null {
  const entry = matlLookup.get(materialLabel);
  const ref = pickAlbedoTextureRef(entry);
  if (!ref) return null;
  const direct = refToPath.get(ref);
  if (direct) return direct;
  const normalized = ref.replace(/^[/\\]+/, "").replace(/\\/g, "/");
  for (const [k, v] of refToPath) {
    if (k === ref || k.endsWith(normalized) || normalized.endsWith(k.replace(/^[/\\]+/, ""))) {
      return v;
    }
  }
  return null;
}
