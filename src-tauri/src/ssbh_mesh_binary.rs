//! Binary packing of ssbh `MeshData` geometry for efficient IPC transfer.
//!
//! Large stage meshes (hundreds of MB of float arrays) must never be shipped as a
//! `serde_json::Value` / JSON text payload: that representation blows memory up roughly
//! 6-10x for float arrays and aborts the host process when the whole stage bundle is
//! serialized for the webview. This module flattens the heavy per-object arrays
//! (positions / normals / uv0 / uv1 as little-endian `f32`, and `vertex_indices` as
//! little-endian `u32`) into a single contiguous byte buffer and produces a small,
//! JSON-serializable header that describes each object plus the byte offset of every
//! attribute inside that buffer. The frontend rebuilds typed-array `BufferAttribute`s
//! directly from the buffer, with no `JSON.parse` of geometry.

use serde::Serialize;
use ssbh_data::mesh_data::{MeshData, VectorData};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};

/// Byte-slice descriptor for one vertex attribute inside the packed buffer.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttributeSlice {
    /// Byte offset of the attribute's first element into the packed geometry buffer.
    pub offset: u64,
    /// Number of vertices (rows). Float element count = `count * components`.
    pub count: u64,
    /// Components per vertex (3 for position/normal, 2 for uv).
    pub components: u32,
}

/// Index-buffer descriptor (little-endian `u32`) inside the packed buffer.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexSlice {
    /// Byte offset of the first index into the packed geometry buffer.
    pub offset: u64,
    /// Number of `u32` indices.
    pub count: u64,
}

/// Per-object header: small metadata plus binary attribute offsets.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshObjectGeometryHeader {
    pub name: String,
    pub subindex: u64,
    pub parent_bone_name: String,
    /// Bone influences kept inline (≈empty for static stage models). Serialized verbatim
    /// so the frontend keeps the existing `bone_influences` shape used for skinning.
    pub bone_influences: serde_json::Value,
    pub vertex_count: u64,
    pub index_count: u64,
    pub positions: Option<AttributeSlice>,
    pub normals: Option<AttributeSlice>,
    pub uv0: Option<AttributeSlice>,
    pub uv1: Option<AttributeSlice>,
    pub indices: IndexSlice,
}

/// Full mesh header that replaces the heavy `mesh: Value` field in the preview bundle.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshGeometryHeader {
    pub major_version: u16,
    pub minor_version: u16,
    pub is_vs2: bool,
    /// Always `true`; marks the binary side-channel path for the frontend.
    pub binary: bool,
    /// Registry key the frontend passes to `take_mesh_geometry` to fetch the packed
    /// geometry buffer. Empty when produced by `pack_mesh_geometry` without registration.
    pub geometry_id: String,
    pub objects: Vec<MeshObjectGeometryHeader>,
}

fn push_f32(buf: &mut Vec<u8>, value: f32) {
    buf.extend_from_slice(&value.to_le_bytes());
}

/// Appends one `VectorData` attribute to `buf` as little-endian `f32` and returns its slice.
fn pack_vector_attribute(buf: &mut Vec<u8>, data: &VectorData) -> AttributeSlice {
    let offset = buf.len() as u64;
    let (count, components) = match data {
        VectorData::Vector2(rows) => {
            for p in rows {
                push_f32(buf, p[0]);
                push_f32(buf, p[1]);
            }
            (rows.len() as u64, 2u32)
        }
        VectorData::Vector3(rows) => {
            for p in rows {
                push_f32(buf, p[0]);
                push_f32(buf, p[1]);
                push_f32(buf, p[2]);
            }
            (rows.len() as u64, 3u32)
        }
        VectorData::Vector4(rows) => {
            for p in rows {
                push_f32(buf, p[0]);
                push_f32(buf, p[1]);
                push_f32(buf, p[2]);
                push_f32(buf, p[3]);
            }
            (rows.len() as u64, 4u32)
        }
    };
    AttributeSlice {
        offset,
        count,
        components,
    }
}

/// Packs every object's geometry into one little-endian byte buffer and builds the header.
///
/// Layout per object, in order: positions, normals, uv0, uv1 (each `f32`), then
/// `vertex_indices` (`u32`). Absent attributes are skipped and reported as `None`.
pub fn pack_mesh_geometry(mesh: &MeshData) -> (MeshGeometryHeader, Vec<u8>) {
    let mut buf: Vec<u8> = Vec::new();
    let mut objects = Vec::with_capacity(mesh.objects.len());

    for obj in &mesh.objects {
        let positions = obj
            .positions
            .first()
            .map(|a| pack_vector_attribute(&mut buf, &a.data));
        let normals = obj
            .normals
            .first()
            .map(|a| pack_vector_attribute(&mut buf, &a.data));
        let uv0 = obj
            .texture_coordinates
            .first()
            .map(|a| pack_vector_attribute(&mut buf, &a.data));
        let uv1 = obj
            .texture_coordinates
            .get(1)
            .map(|a| pack_vector_attribute(&mut buf, &a.data));

        let index_offset = buf.len() as u64;
        for index in &obj.vertex_indices {
            buf.extend_from_slice(&index.to_le_bytes());
        }

        let vertex_count = positions.as_ref().map(|p| p.count).unwrap_or(0);
        objects.push(MeshObjectGeometryHeader {
            name: obj.name.clone(),
            subindex: obj.subindex,
            parent_bone_name: obj.parent_bone_name.clone(),
            bone_influences: serde_json::to_value(&obj.bone_influences)
                .unwrap_or_else(|_| serde_json::Value::Array(Vec::new())),
            vertex_count,
            index_count: obj.vertex_indices.len() as u64,
            positions,
            normals,
            uv0,
            uv1,
            indices: IndexSlice {
                offset: index_offset,
                count: obj.vertex_indices.len() as u64,
            },
        });
    }

    (
        MeshGeometryHeader {
            major_version: mesh.major_version,
            minor_version: mesh.minor_version,
            is_vs2: mesh.is_vs2,
            binary: true,
            geometry_id: String::new(),
            objects,
        },
        buf,
    )
}

// ── Process-global geometry registry ────────────────────────────────────────
//
// The packed geometry buffer cannot travel inside the bundle JSON (that is the whole
// point). Instead each packed mesh is stored here under a process-unique id; the header
// carries that id, and the frontend fetches the raw bytes via `take_mesh_geometry`,
// which removes the entry so memory is released as soon as the webview has the buffer.
// A global (rather than Tauri-managed state) is used because the mesh producers are plain
// functions invoked from many call sites without access to `State`.

static GEOMETRY_REGISTRY: OnceLock<Mutex<HashMap<String, Vec<u8>>>> = OnceLock::new();
static GEOMETRY_COUNTER: AtomicU64 = AtomicU64::new(0);

fn registry() -> &'static Mutex<HashMap<String, Vec<u8>>> {
    GEOMETRY_REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Stores a packed geometry buffer and returns its registry id.
pub fn register_geometry(buf: Vec<u8>) -> String {
    let id = format!("geom-{}", GEOMETRY_COUNTER.fetch_add(1, Ordering::Relaxed));
    if let Ok(mut map) = registry().lock() {
        map.insert(id.clone(), buf);
    }
    id
}

/// Removes and returns a packed geometry buffer, if still present.
pub fn take_geometry(id: &str) -> Option<Vec<u8>> {
    registry().lock().ok().and_then(|mut map| map.remove(id))
}

/// Drops every buffered geometry blob (called when the scene is reset / a new stage opens).
pub fn clear_geometry_registry() {
    if let Ok(mut map) = registry().lock() {
        map.clear();
    }
}

/// Packs a mesh, registers its geometry buffer, and returns the header carrying the id.
pub fn pack_and_register(mesh: &MeshData) -> MeshGeometryHeader {
    let (mut header, buf) = pack_mesh_geometry(mesh);
    header.geometry_id = register_geometry(buf);
    header
}

/// Tauri command: hand the packed geometry buffer for `geometry_id` to the webview as raw
/// bytes (an `ArrayBuffer`), removing it from the registry.
#[tauri::command]
pub fn take_mesh_geometry(geometry_id: String) -> Result<tauri::ipc::Response, String> {
    match take_geometry(&geometry_id) {
        Some(bytes) => Ok(tauri::ipc::Response::new(bytes)),
        None => Err(format!(
            "Mesh geometry buffer not found or already consumed: {geometry_id}"
        )),
    }
}

/// Tauri command: drop all buffered geometry blobs.
#[tauri::command]
pub fn clear_mesh_geometry_registry() {
    clear_geometry_registry();
}

#[cfg(test)]
mod tests {
    use super::*;
    use ssbh_data::mesh_data::{AttributeData, MeshObjectData};

    fn read_f32(buf: &[u8], byte_offset: u64) -> f32 {
        let o = byte_offset as usize;
        f32::from_le_bytes(buf[o..o + 4].try_into().unwrap())
    }

    fn read_u32(buf: &[u8], byte_offset: u64) -> u32 {
        let o = byte_offset as usize;
        u32::from_le_bytes(buf[o..o + 4].try_into().unwrap())
    }

    fn sample_mesh() -> MeshData {
        let obj = MeshObjectData {
            name: "obj".to_string(),
            subindex: 0,
            positions: vec![AttributeData {
                name: "Position0".to_string(),
                data: VectorData::Vector3(vec![
                    glam::Vec3::new(1.0, 2.0, 3.0),
                    glam::Vec3::new(4.0, 5.0, 6.0),
                    glam::Vec3::new(7.0, 8.0, 9.0),
                ]),
            }],
            normals: vec![AttributeData {
                name: "Normal0".to_string(),
                data: VectorData::Vector3(vec![
                    glam::Vec3::new(0.0, 0.0, 1.0),
                    glam::Vec3::new(0.0, 1.0, 0.0),
                    glam::Vec3::new(1.0, 0.0, 0.0),
                ]),
            }],
            texture_coordinates: vec![AttributeData {
                name: "map1".to_string(),
                data: VectorData::Vector2(vec![
                    glam::Vec2::new(0.0, 0.0),
                    glam::Vec2::new(1.0, 0.0),
                    glam::Vec2::new(1.0, 1.0),
                ]),
            }],
            vertex_indices: vec![0, 1, 2],
            ..Default::default()
        };
        MeshData {
            major_version: 1,
            minor_version: 8,
            objects: vec![obj],
            is_vs2: false,
        }
    }

    #[test]
    fn packs_positions_normals_uv_indices_with_correct_offsets() {
        let mesh = sample_mesh();
        let (header, buf) = pack_mesh_geometry(&mesh);

        assert!(header.binary);
        assert_eq!(header.objects.len(), 1);
        let o = &header.objects[0];

        let positions = o.positions.as_ref().expect("positions slice");
        assert_eq!(positions.components, 3);
        assert_eq!(positions.count, 3);
        assert_eq!(o.vertex_count, 3);
        // Positions are first, at offset 0.
        assert_eq!(positions.offset, 0);
        assert_eq!(read_f32(&buf, positions.offset), 1.0);
        assert_eq!(read_f32(&buf, positions.offset + 4), 2.0);
        // 3rd vertex (index 2) .y: 2 * 3 components * 4 bytes + 1 component * 4 bytes = 28.
        assert_eq!(read_f32(&buf, positions.offset + 28), 8.0);

        let normals = o.normals.as_ref().expect("normals slice");
        assert_eq!(normals.components, 3);
        // Normals follow 3 vertices * 3 components * 4 bytes = 36 bytes.
        assert_eq!(normals.offset, 36);
        assert_eq!(read_f32(&buf, normals.offset), 0.0);
        assert_eq!(read_f32(&buf, normals.offset + 8), 1.0); // first normal .z

        let uv0 = o.uv0.as_ref().expect("uv0 slice");
        assert_eq!(uv0.components, 2);
        assert_eq!(uv0.count, 3);
        assert!(o.uv1.is_none());

        // Indices come last as u32.
        assert_eq!(o.indices.count, 3);
        assert_eq!(o.index_count, 3);
        assert_eq!(read_u32(&buf, o.indices.offset), 0);
        assert_eq!(read_u32(&buf, o.indices.offset + 4), 1);
        assert_eq!(read_u32(&buf, o.indices.offset + 8), 2);

        // Buffer size = (3 pos*3 + 3 nrm*3 + 3 uv*2) f32 + 3 u32 = (9+9+6+3)*4 = 108 bytes.
        assert_eq!(buf.len(), 108);
    }

    #[test]
    fn register_then_take_returns_buffer_and_frees_it() {
        let mesh = sample_mesh();
        let header = pack_and_register(&mesh);
        assert!(!header.geometry_id.is_empty());

        let bytes = take_geometry(&header.geometry_id).expect("buffer present");
        assert_eq!(bytes.len(), 108);
        // Second take returns nothing — the entry was removed.
        assert!(take_geometry(&header.geometry_id).is_none());
    }

    #[test]
    fn empty_mesh_produces_empty_buffer() {
        let mesh = MeshData {
            major_version: 1,
            minor_version: 8,
            objects: Vec::new(),
            is_vs2: false,
        };
        let (header, buf) = pack_mesh_geometry(&mesh);
        assert!(header.objects.is_empty());
        assert!(buf.is_empty());
    }
}
