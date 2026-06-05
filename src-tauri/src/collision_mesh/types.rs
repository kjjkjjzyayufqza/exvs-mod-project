use crate::ssbh_dae::UpAxisConversion;

/// Merged triangle mesh in collision space (post skin-bake, axis/scale).
#[derive(Debug, Clone, PartialEq)]
pub struct CollisionTriMesh {
    pub vertices: Vec<[f64; 3]>,
    /// Triangle list (len divisible by 3).
    pub indices: Vec<u32>,
}

impl CollisionTriMesh {
    pub fn triangle_count(&self) -> usize {
        self.indices.len() / 3
    }

    pub fn compute_aabb(&self) -> Result<([f64; 3], [f64; 3]), String> {
        if self.vertices.is_empty() {
            return Err("Collision mesh has no vertices".into());
        }
        let mut min = [f64::INFINITY; 3];
        let mut max = [f64::NEG_INFINITY; 3];
        for v in &self.vertices {
            for axis in 0..3 {
                min[axis] = min[axis].min(v[axis]);
                max[axis] = max[axis].max(v[axis]);
            }
        }
        Ok((min, max))
    }
}

/// One authored collision primitive in local mesh vertex space.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CollisionPrimitive {
    Triangle([u32; 3]),
    Quad([u32; 4]),
}

impl CollisionPrimitive {
    pub fn primitive_key_count(self) -> u32 {
        match self {
            Self::Triangle(_) => 1,
            Self::Quad(_) => 2,
        }
    }

    pub fn triangle_count(self) -> usize {
        match self {
            Self::Triangle(_) => 1,
            Self::Quad(_) => 2,
        }
    }

    pub fn indices4(self) -> [u32; 4] {
        match self {
            Self::Triangle([a, b, c]) => [a, b, c, c],
            Self::Quad(indices) => indices,
        }
    }

    pub fn unique_indices(self) -> [u32; 4] {
        self.indices4()
    }
}

/// Authored collision mesh that can preserve real quads before HKT encoding.
#[derive(Debug, Clone, PartialEq)]
pub struct CollisionPrimitiveMesh {
    pub vertices: Vec<[f64; 3]>,
    pub primitives: Vec<CollisionPrimitive>,
}

impl CollisionPrimitiveMesh {
    pub fn primitive_count(&self) -> usize {
        self.primitives.len()
    }

    pub fn primitive_key_count(&self) -> u32 {
        self.primitives
            .iter()
            .map(|primitive| primitive.primitive_key_count())
            .sum()
    }

    pub fn triangle_count(&self) -> usize {
        self.primitives
            .iter()
            .map(|primitive| primitive.triangle_count())
            .sum()
    }

    pub fn compute_aabb(&self) -> Result<([f64; 3], [f64; 3]), String> {
        if self.vertices.is_empty() {
            return Err("Collision mesh has no vertices".into());
        }
        let mut min = [f64::INFINITY; 3];
        let mut max = [f64::NEG_INFINITY; 3];
        for v in &self.vertices {
            for axis in 0..3 {
                min[axis] = min[axis].min(v[axis]);
                max[axis] = max[axis].max(v[axis]);
            }
        }
        Ok((min, max))
    }

    pub fn to_triangle_mesh(&self) -> CollisionTriMesh {
        let mut indices = Vec::with_capacity(self.triangle_count() * 3);
        for primitive in &self.primitives {
            match primitive {
                CollisionPrimitive::Triangle([a, b, c]) => {
                    indices.extend_from_slice(&[*a, *b, *c]);
                }
                CollisionPrimitive::Quad([a, b, c, d]) => {
                    indices.extend_from_slice(&[*a, *b, *c, *a, *c, *d]);
                }
            }
        }
        CollisionTriMesh {
            vertices: self.vertices.clone(),
            indices,
        }
    }
}

/// Authored collision output can contain multiple compressed-mesh shapes.
#[derive(Debug, Clone, PartialEq)]
pub struct AuthoredCollisionSet {
    pub shapes: Vec<CollisionPrimitiveMesh>,
}

impl AuthoredCollisionSet {
    pub fn shape_count(&self) -> usize {
        self.shapes.len()
    }

    pub fn primitive_count(&self) -> usize {
        self.shapes
            .iter()
            .map(CollisionPrimitiveMesh::primitive_count)
            .sum()
    }

    pub fn primitive_key_count(&self) -> u32 {
        self.shapes
            .iter()
            .map(CollisionPrimitiveMesh::primitive_key_count)
            .sum()
    }

    pub fn triangle_count(&self) -> usize {
        self.shapes
            .iter()
            .map(CollisionPrimitiveMesh::triangle_count)
            .sum()
    }

    pub fn vertex_count(&self) -> usize {
        self.shapes.iter().map(|shape| shape.vertices.len()).sum()
    }

    pub fn to_triangle_mesh(&self) -> CollisionTriMesh {
        let mut vertices = Vec::new();
        let mut indices = Vec::new();
        for shape in &self.shapes {
            let base = vertices.len() as u32;
            vertices.extend_from_slice(&shape.vertices);
            let tri_mesh = shape.to_triangle_mesh();
            indices.extend(tri_mesh.indices.into_iter().map(|index| index + base));
        }
        CollisionTriMesh { vertices, indices }
    }
}

impl CollisionTriMesh {
    pub fn to_primitive_mesh(&self) -> CollisionPrimitiveMesh {
        let mut primitives = Vec::with_capacity(self.triangle_count());
        for tri in self.indices.chunks_exact(3) {
            primitives.push(CollisionPrimitive::Triangle([tri[0], tri[1], tri[2]]));
        }
        CollisionPrimitiveMesh {
            vertices: self.vertices.clone(),
            primitives,
        }
    }
}

/// Default maximum angle (degrees) between mergeable face normals — medium preset.
pub const DEFAULT_PLANARITY_ANGLE_DEG: f64 = 15.0;

/// Cosine threshold from planarity angle in degrees.
pub fn cos_planarity_from_angle_deg(angle_deg: f64) -> f64 {
    angle_deg.to_radians().cos()
}

/// How collision geometry is reduced before HKT encoding.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum CollisionSimplifyMode {
    /// Merge coplanar faces and optionally decimate, keeping the original surface.
    #[default]
    ShapePreserving,
    /// Replace the geometry with a coarse convex hull ("outer frame").
    ConvexHull,
}

/// Havok-style collision mesh simplification settings.
///
/// Mirrors `hkaiNavMeshGenerationSettings::m_cosPlanarityThreshold`:
/// adjacent faces merge when the cosine of their normal angle exceeds this value.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CollisionSimplifyOptions {
    pub enabled: bool,
    /// Cosine of the maximum angle between mergeable face normals (default 8°).
    pub cos_planarity_threshold: f64,
    /// Drop triangles below this area before simplification.
    pub min_triangle_area: f64,
    /// Weld vertices closer than this distance (collision-space units).
    pub weld_epsilon: f64,
    /// Optional target ratio for spatial decimation after similar-face merging.
    pub target_triangle_ratio: Option<f64>,
    /// Optional absolute cap applied with `target_triangle_ratio`.
    pub max_target_triangles: Option<usize>,
    /// Collision reduction strategy.
    pub mode: CollisionSimplifyMode,
    /// For `ConvexHull` mode: collapse the hull toward this many faces (None = no extra budget).
    pub hull_target_faces: Option<usize>,
    /// Merge valid coplanar triangle pairs into authored quad primitives.
    pub quad_merge_enabled: bool,
}

impl Default for CollisionSimplifyOptions {
    fn default() -> Self {
        Self {
            enabled: true,
            cos_planarity_threshold: cos_planarity_from_angle_deg(DEFAULT_PLANARITY_ANGLE_DEG),
            min_triangle_area: 1e-6,
            weld_epsilon: 1e-3,
            target_triangle_ratio: None,
            max_target_triangles: None,
            mode: CollisionSimplifyMode::ShapePreserving,
            hull_target_faces: None,
            quad_merge_enabled: true,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CollisionMeshOptions {
    pub scale_factor: f64,
    pub up_axis: UpAxisConversion,
    pub simplify: CollisionSimplifyOptions,
}

impl Default for CollisionMeshOptions {
    fn default() -> Self {
        Self {
            scale_factor: 1.0,
            up_axis: UpAxisConversion::YUp,
            simplify: CollisionSimplifyOptions::default(),
        }
    }
}

impl CollisionMeshOptions {
    pub fn from_ssbh_axis(up_axis: &str, scale_factor: f64) -> Self {
        let up_axis = match up_axis.to_ascii_lowercase().as_str() {
            "z_up" | "zup" => UpAxisConversion::ZUp,
            "none" | "no_conversion" => UpAxisConversion::NoConversion,
            _ => UpAxisConversion::YUp,
        };
        Self {
            scale_factor,
            up_axis,
            simplify: CollisionSimplifyOptions::default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_planarity_matches_medium_preset_degrees() {
        let opts = CollisionSimplifyOptions::default();
        let expected = cos_planarity_from_angle_deg(DEFAULT_PLANARITY_ANGLE_DEG);
        assert!((opts.cos_planarity_threshold - expected).abs() < 1e-12);
        assert!((opts.weld_epsilon - 1e-3).abs() < 1e-12);
        assert!((opts.min_triangle_area - 1e-6).abs() < 1e-12);
        assert_eq!(opts.target_triangle_ratio, None);
        assert_eq!(opts.max_target_triangles, None);
    }

    #[test]
    fn from_ssbh_axis_applies_scale_and_z_up() {
        let opts = CollisionMeshOptions::from_ssbh_axis("z_up", 2.0);
        assert_eq!(opts.scale_factor, 2.0);
        assert_eq!(opts.up_axis, UpAxisConversion::ZUp);
    }

    #[test]
    fn default_simplify_mode_is_shape_preserving() {
        let opts = CollisionSimplifyOptions::default();
        assert_eq!(opts.mode, CollisionSimplifyMode::ShapePreserving);
        assert_eq!(opts.hull_target_faces, None);
    }

    #[test]
    fn primitive_mesh_counts_quad_keys_and_triangles() {
        let mesh = CollisionPrimitiveMesh {
            vertices: vec![
                [0.0, 0.0, 0.0],
                [1.0, 0.0, 0.0],
                [1.0, 1.0, 0.0],
                [0.0, 1.0, 0.0],
            ],
            primitives: vec![
                CollisionPrimitive::Quad([0, 1, 2, 3]),
                CollisionPrimitive::Triangle([0, 2, 3]),
            ],
        };

        assert_eq!(mesh.primitive_count(), 2);
        assert_eq!(mesh.primitive_key_count(), 3);
        assert_eq!(mesh.triangle_count(), 3);
        assert_eq!(mesh.to_triangle_mesh().triangle_count(), 3);
    }
}
