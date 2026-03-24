import { BufferAttribute, BufferGeometry } from "three";
import type {
  MatlDataJson,
  MatlEntryJson,
  MeshDataJson,
  MeshObjectJson,
  ModlDataJson,
  ModlEntryJson,
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

function buildGeometryForObject(obj: MeshObjectJson): BufferGeometry {
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
  const nAttr = obj.normals[0];
  const normals = nAttr ? vectorDataToVec3(nAttr.data) : null;
  const uvAttr = obj.texture_coordinates[0];
  const uvs = uvAttr ? vectorDataToVec2(uvAttr.data) : null;

  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];

  for (let i = 0; i < indices.length; i++) {
    const vi = indices[i]!;
    const p = positions[vi];
    if (!p) {
      throw new Error(
        `Mesh "${obj.name}" subindex ${obj.subindex}: vertex index ${vi} out of range`,
      );
    }
    pos.push(p[0], p[1], p[2]);
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
  return geom;
}

export function buildDrawListFromBundle(
  modl: ModlDataJson,
  mesh: MeshDataJson,
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
    const geometry = buildGeometryForObject(obj);
    out.push({
      key,
      label,
      geometry,
      materialLabel: entry.material_label,
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
