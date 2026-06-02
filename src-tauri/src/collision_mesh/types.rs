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
}
