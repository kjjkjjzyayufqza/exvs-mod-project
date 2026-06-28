//! Bake and merge scene meshes into a single collision triangle mesh.

mod axis;
mod convex_hull;
mod import;
mod simplify;
mod skin_bake;
mod types;

pub use import::{parse_import_scene_from_bytes, parse_import_scene_from_path};
pub use simplify::{author_collision_shapes, simplify_collision_mesh};
pub use skin_bake::bake_and_merge_collision_mesh;
pub use types::{
    cos_planarity_from_angle_deg, AuthoredCollisionSet, CollisionMeshOptions, CollisionPrimitive,
    CollisionPrimitiveMesh, CollisionSimplifyMode, CollisionSimplifyOptions, CollisionTriMesh,
};
