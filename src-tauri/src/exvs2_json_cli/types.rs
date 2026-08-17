use super::util::{normalize_type_name, supported_type_list};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum InspectType {
    Jnttbl,
    CharacterIdTable,
    VernierTable,
    ArmsParam,
    BulletParam,
    SpeedParam,
    ProjectileDepictionTable,
    HitGroupIdDef,
    InteractionId,
    GrapParam,
    NaviList,
    PilotList,
    Nusktb,
    Numshb,
    Numdlb,
}

impl InspectType {
    pub fn as_str(self) -> &'static str {
        match self {
            InspectType::Jnttbl => "jnttbl",
            InspectType::CharacterIdTable => "character_id_table",
            InspectType::VernierTable => "vernier_table",
            InspectType::ArmsParam => "armsparam",
            InspectType::BulletParam => "bulletparam",
            InspectType::SpeedParam => "speedparam",
            InspectType::ProjectileDepictionTable => "projectile_depiction_table",
            InspectType::HitGroupIdDef => "hitgroupiddef",
            InspectType::InteractionId => "interactionid",
            InspectType::GrapParam => "grapparam",
            InspectType::NaviList => "navi_list",
            InspectType::PilotList => "pilot_list",
            InspectType::Nusktb => "nusktb",
            InspectType::Numshb => "numshb",
            InspectType::Numdlb => "numdlb",
        }
    }

    pub(crate) fn parse(value: &str) -> Result<Self, String> {
        match normalize_type_name(value).as_str() {
            "jnttbl" => Ok(InspectType::Jnttbl),
            "character_id_table" => Ok(InspectType::CharacterIdTable),
            "vernier_table" => Ok(InspectType::VernierTable),
            "armsparam" => Ok(InspectType::ArmsParam),
            "bulletparam" => Ok(InspectType::BulletParam),
            "speedparam" => Ok(InspectType::SpeedParam),
            "projectile_depiction_table" => Ok(InspectType::ProjectileDepictionTable),
            "hitgroupiddef" | "hitgroup_id_def" | "hitgroup" => Ok(InspectType::HitGroupIdDef),
            "interactionid" | "interaction_id" | "interaction" => Ok(InspectType::InteractionId),
            "grapparam" | "grap_param" | "grap" => Ok(InspectType::GrapParam),
            "navi_list" | "navilist" => Ok(InspectType::NaviList),
            "pilot_list" | "pilotlist" => Ok(InspectType::PilotList),
            "nusktb" | "skel" | "ssbh_skel" => Ok(InspectType::Nusktb),
            "numshb" | "mesh" | "ssbh_mesh" => Ok(InspectType::Numshb),
            "numdlb" | "modl" | "ssbh_modl" => Ok(InspectType::Numdlb),
            other => Err(format!(
                "Unsupported --type '{other}'. Supported types: {}",
                supported_type_list()
            )),
        }
    }

    pub(crate) fn supports_lossless_edit(self) -> bool {
        matches!(
            self,
            InspectType::Jnttbl
                | InspectType::CharacterIdTable
                | InspectType::VernierTable
                | InspectType::ArmsParam
                | InspectType::BulletParam
                | InspectType::SpeedParam
                | InspectType::ProjectileDepictionTable
                | InspectType::HitGroupIdDef
                | InspectType::InteractionId
                | InspectType::GrapParam
                | InspectType::NaviList
                | InspectType::PilotList
        )
    }
}

#[derive(Clone, Debug, Default)]
pub struct InspectOptions {
    pub inspect_type: Option<InspectType>,
    pub pretty: bool,
    pub summary: bool,
    pub raw_fields: bool,
    pub roundtrip_check: bool,
}
