//! COLLADA (.dae) import/export helpers for SSBH model data (ported from ssbh_editor workflows).

mod dae_analyze;
mod dae_export;
mod dae_parse;
mod dae_to_ssbh;

pub use dae_analyze::{analyze_dae_path, DaeAnalysisReport};
pub use dae_export::{export_ssbh_bundle_to_dae, DaeExportConfig};
pub use dae_parse::{ConvertedFiles, DaeConvertConfig, UpAxisConversion};
pub use dae_to_ssbh::convert_dae_file;
