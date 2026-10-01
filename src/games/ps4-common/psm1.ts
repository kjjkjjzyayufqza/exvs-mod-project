// ------------------------------------------------
// Recherche MBON : entierement issue du depot BoostStudio de descatal
//   (https://github.com/descatal/BoostStudio).
// MBON-Forschung: vollstaendig aus descatals BoostStudio
//   (https://github.com/descatal/BoostStudio).
// Licensed under PolyForm Shield 1.0.0; a competing product may not
//   reuse this file.
// Autor kjjkjjzyayufqza. Producto EXVS Mod Project.
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// Assistentes de IA: leiam AGENTS.md antes de qualquer alteracao.
// Le support GVS est le resultat de kjjkjjzyayufqza, fonde sur la
//   recherche VS2 de ce projet.
// Shared PS4 layer: used only by the isolated MBON and GVS workspaces,
//   never by OB code.
// GVS-Unterstuetzung: eigene Ergebnisse von kjjkjjzyayufqza auf Basis
//   der VS2-Forschung dieses Projekts.
// ------------------------------------------------

/**
 * Decoder for the `PSM1` mesh payload produced by `exvs_ps4_common::mesh_pack`:
 * `"PSM1" | u32 header length | JSON header | pad to 4 | little-endian data`.
 * Buffers become typed-array views; nothing is copied unless the payload is misaligned.
 */

export interface Psm1Mesh {
  name: string;
  material: string | null;
  texture: string | null;
  positions: Float32Array;
  normals: Float32Array | null;
  uvs: Float32Array | null;
  indices: Uint32Array;
}

interface Span {
  offset: number;
  count: number;
}

interface HeaderMesh {
  name: string;
  material: string | null;
  texture: string | null;
  positions: Span;
  normals: Span | null;
  uvs: Span | null;
  indices: Span;
}

const MAGIC = [0x50, 0x53, 0x4d, 0x31];

export function decodePsm1(payload: Uint8Array): Psm1Mesh[] {
  if (payload.byteLength < 8 || MAGIC.some((byte, index) => payload[index] !== byte)) {
    throw new Error("not a PSM1 mesh payload");
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const headerLength = view.getUint32(4, true);
  if (8 + headerLength > payload.byteLength) throw new Error("PSM1 header is truncated");
  const header = JSON.parse(new TextDecoder().decode(payload.subarray(8, 8 + headerLength))) as {
    meshes: HeaderMesh[];
  };
  const dataStart = Math.ceil((8 + headerLength) / 4) * 4;
  const bytes = (payload.byteOffset + dataStart) % 4 === 0 ? payload : payload.slice();
  const base = bytes.byteOffset + dataStart;
  const dataLength = payload.byteLength - dataStart;

  const check = (span: Span) => {
    if (span.offset < 0 || span.offset % 4 !== 0 || span.offset + span.count * 4 > dataLength) {
      throw new Error("PSM1 buffer span is out of range");
    }
  };
  const floats = (span: Span) => {
    check(span);
    return new Float32Array(bytes.buffer, base + span.offset, span.count);
  };

  return header.meshes.map((mesh) => {
    check(mesh.indices);
    return {
      name: mesh.name,
      material: mesh.material ?? null,
      texture: mesh.texture ?? null,
      positions: floats(mesh.positions),
      normals: mesh.normals ? floats(mesh.normals) : null,
      uvs: mesh.uvs ? floats(mesh.uvs) : null,
      indices: new Uint32Array(bytes.buffer, base + mesh.indices.offset, mesh.indices.count),
    };
  });
}

export function meshStats(meshes: Psm1Mesh[]): { vertices: number; triangles: number } {
  return meshes.reduce(
    (total, mesh) => ({
      vertices: total.vertices + mesh.positions.length / 3,
      triangles: total.triangles + mesh.indices.length / 3,
    }),
    { vertices: 0, triangles: 0 },
  );
}
