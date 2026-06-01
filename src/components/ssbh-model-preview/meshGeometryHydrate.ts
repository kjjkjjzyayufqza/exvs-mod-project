import { invoke } from "@tauri-apps/api/core";
import type {
  MeshAttributeSliceJson,
  MeshGeometryHeaderJson,
  MeshObjectGeometryHeaderJson,
  MeshObjectJson,
} from "./types";

/**
 * Binary mesh geometry hydration.
 *
 * The Rust loader ships geometry as a compact binary blob (positions/normals/uv0/uv1 as
 * f32, vertex_indices as u32) registered under a `geometryId`, instead of inline JSON
 * arrays that would blow memory up and abort the host. After a bundle arrives, call
 * {@link hydrateBundleGeometry} to fetch the blob once and attach typed-array views
 * (`__bin`) onto every mesh object, plus bridge the camelCase header fields to the
 * snake_case names the renderer reads. `buildGeometryForObject` then builds geometry
 * directly from those views with no intermediate nested arrays.
 */

type BundleLike = { mesh?: unknown } | null | undefined;

type BinaryMeshHeader = MeshGeometryHeaderJson & {
  /** Runtime guard so a re-rendered bundle is not fetched twice. */
  __hydrated?: boolean;
};

function isBinaryHeader(mesh: unknown): mesh is BinaryMeshHeader {
  return (
    !!mesh &&
    typeof mesh === "object" &&
    (mesh as { binary?: unknown }).binary === true &&
    typeof (mesh as { geometryId?: unknown }).geometryId === "string"
  );
}

function sliceToF32(buffer: ArrayBuffer, slice: MeshAttributeSliceJson | null): Float32Array | null {
  if (!slice || slice.count === 0) return null;
  return new Float32Array(buffer, slice.offset, slice.count * slice.components);
}

function attachViews(headerObj: MeshObjectGeometryHeaderJson, buffer: ArrayBuffer): void {
  // Mutate the header object in place so the same reference, once stored in component
  // state, carries its geometry to every downstream `buildDrawListFromBundle` call.
  const target = headerObj as unknown as MeshObjectJson;
  target.parent_bone_name = headerObj.parentBoneName ?? target.parent_bone_name ?? "";
  if (headerObj.boneInfluences) target.bone_influences = headerObj.boneInfluences;
  target.__bin = {
    positions: sliceToF32(buffer, headerObj.positions),
    normals: sliceToF32(buffer, headerObj.normals),
    uv0: sliceToF32(buffer, headerObj.uv0),
    uv1: sliceToF32(buffer, headerObj.uv1),
    indices: new Uint32Array(buffer, headerObj.indices.offset, headerObj.indices.count),
  };
}

/**
 * Fetches and attaches the binary geometry for a single bundle. No-op for legacy
 * inline-array bundles or already-hydrated bundles.
 */
export async function hydrateBundleGeometry(bundle: BundleLike): Promise<void> {
  const mesh = bundle?.mesh;
  if (!isBinaryHeader(mesh) || mesh.__hydrated) return;
  const buffer = await invoke<ArrayBuffer>("take_mesh_geometry", {
    geometryId: mesh.geometryId,
  });
  for (const obj of mesh.objects) attachViews(obj, buffer);
  mesh.__hydrated = true;
}

/** Hydrates a base model and a list of sub-model bundles in sequence. */
export async function hydrateStageBundleGeometry(
  baseModel: BundleLike,
  subModels: ReadonlyArray<{ bundle: BundleLike }>,
): Promise<void> {
  await hydrateBundleGeometry(baseModel);
  for (const sub of subModels) {
    await hydrateBundleGeometry(sub.bundle);
  }
}

/** Drops every buffered geometry blob still held by the backend (e.g. on scene reset). */
export function clearMeshGeometryRegistry(): Promise<void> {
  return invoke<void>("clear_mesh_geometry_registry");
}
