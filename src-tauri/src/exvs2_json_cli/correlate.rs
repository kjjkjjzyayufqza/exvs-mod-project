use serde_json::{json, Value};

use super::util::format_hex_u32;
use super::{SCHEMA_VERSION, TOOL_NAME};

#[derive(Debug, Default)]
pub(crate) struct CorrelateOptions {
    pub(crate) unit: Option<String>,
    pub(crate) weapon: Option<String>,
    pub(crate) dispatcher_id: Option<u32>,
    pub(crate) player_facing_name: Option<String>,
    pub(crate) atwiki_url: Option<String>,
    pub(crate) ida_dispatcher: Option<String>,
    pub(crate) ida_wrapper: Option<String>,
    pub(crate) ida_constructor: Option<String>,
    pub(crate) task_class: Option<String>,
    pub(crate) object_size: Option<String>,
    pub(crate) pretty: bool,
}

pub(crate) fn build_correlation_report(options: CorrelateOptions) -> Result<Value, String> {
    let unit = options
        .unit
        .ok_or_else(|| "correlate requires --unit <bucket>".to_string())?;
    let weapon = options
        .weapon
        .ok_or_else(|| "correlate requires --weapon <task-name>".to_string())?;
    let dispatcher_id = options
        .dispatcher_id
        .ok_or_else(|| "correlate requires --id <dispatcher-id>".to_string())?;

    Ok(json!({
        "tool": TOOL_NAME,
        "schemaVersion": SCHEMA_VERSION,
        "reportType": "correlation",
        "unit": {
            "bucket": unit,
            "playerFacingName": options.player_facing_name,
            "atwikiUrl": options.atwiki_url
        },
        "weapon": {
            "taskName": weapon,
            "dispatcherId": dispatcher_id,
            "dispatcherIdHex": format_hex_u32(dispatcher_id)
        },
        "idaEvidence": {
            "dispatcher": options.ida_dispatcher,
            "wrapper": options.ida_wrapper,
            "constructor": options.ida_constructor,
            "taskClass": options.task_class,
            "objectSize": options.object_size
        },
        "resourceEvidence": {
            "jnttblBones": [],
            "vernierEnabledFollowBoneRows": []
        },
        "runtimeEvidenceNeeded": [
            "Confirm task_param+5 gate",
            "Confirm sub_14062B180 caller and argument triple",
            "Confirm effect_id, hitgroup_ref, and bone_hash together rather than effect id alone"
        ],
        "guardrails": [
            "A JNT bone hash proves model support, not task activation.",
            "A vernier row proves resource support, not runtime gate state.",
            "arms_param.is_vernier is not task_param+5.",
            "ATWiki names are player-facing vocabulary, not binary evidence."
        ]
    }))
}
