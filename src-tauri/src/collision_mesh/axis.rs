use crate::ssbh_dae::UpAxisConversion;

use super::types::CollisionMeshOptions;

pub fn apply_collision_axis_scale(point: [f64; 3], options: &CollisionMeshOptions) -> [f64; 3] {
    let mut p = [
        point[0] * options.scale_factor,
        point[1] * options.scale_factor,
        point[2] * options.scale_factor,
    ];
    match options.up_axis {
        UpAxisConversion::ZUp => {
            let temp = p[1];
            p[1] = p[2];
            p[2] = -temp;
        }
        UpAxisConversion::YUp | UpAxisConversion::NoConversion => {}
    }
    p
}
