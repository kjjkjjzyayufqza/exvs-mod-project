use app_lib::ssbh_motion_interchange::{
    import_motion_fbx, MotionFbxImportRequest, RigBindingPolicy,
};
use std::env;

fn main() {
    let fbx = env::args().nth(1).unwrap();
    let skel = env::args().nth(2).unwrap();
    let out = env::args().nth(3).unwrap();
    let report = import_motion_fbx(MotionFbxImportRequest {
        fbx_path: fbx,
        nusktb_path: skel,
        output_nuanmb_path: out.clone(),
        template_nuanmb_path: None,
        animation_stack_name: None,
        rig_binding_policy: RigBindingPolicy::default(),
    })
    .expect("import");
    println!(
        "import frames={} matched={} ignored={} warnings={:?}",
        report.frame_count,
        report.matched_bones.len(),
        report.ignored_bones.len(),
        report.warnings
    );
    println!("output={}", report.output_path);
}
