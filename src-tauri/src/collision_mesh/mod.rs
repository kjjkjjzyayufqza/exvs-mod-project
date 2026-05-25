//! Bake and merge scene meshes into a single collision triangle mesh.

mod axis;
mod import;
mod simplify;
mod skin_bake;
mod types;

pub use import::parse_import_scene_from_bytes;
pub use simplify::simplify_collision_mesh;
pub use skin_bake::bake_and_merge_collision_mesh;
pub use types::{
    cos_planarity_from_angle_deg, CollisionMeshOptions, CollisionSimplifyOptions, CollisionTriMesh,
};
