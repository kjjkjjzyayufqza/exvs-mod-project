// Auto-derived from docs/agent-sessions/scene-object-texture-param-placement/stage_csv_common_values.json
export type PlacementVdkType = "EFFECT" | "OBJECT" | "PROP" | "SKY";
export type PlacementFieldCategory =
  | "transform"
  | "identity"
  | "animation"
  | "attach"
  | "prop"
  | "effect"
  | "links"
  | "physics"
  | "other";
export type PlacementFieldKind = "bool" | "number" | "string";
export interface PlacementFieldMeta {
  key: string;
  category: PlacementFieldCategory;
  kind: PlacementFieldKind;
  sampleValues: string[];
}
export const PLACEMENT_VDK_TYPES: PlacementVdkType[] = ["EFFECT", "OBJECT", "PROP", "SKY"];
export const PLACEMENT_FIELD_CATALOG: PlacementFieldMeta[] = [
  {
    "key": "VDK_ANIM_INDEX",
    "category": "animation",
    "kind": "number",
    "sampleValues": [
      "1"
    ]
  },
  {
    "key": "VDK_ANIM_LOOP",
    "category": "animation",
    "kind": "bool",
    "sampleValues": [
      "TRUE"
    ]
  },
  {
    "key": "VDK_ANIM_OFFSET",
    "category": "animation",
    "kind": "number",
    "sampleValues": [
      "0",
      "3000",
      "6750",
      "9000",
      "11250",
      "13500"
    ]
  },
  {
    "key": "VDK_ANIM_WAIT",
    "category": "animation",
    "kind": "number",
    "sampleValues": [
      "0"
    ]
  },
  {
    "key": "VDK_ATTACH_EFFECT_0_ID",
    "category": "attach",
    "kind": "string",
    "sampleValues": [
      "EFF_205STAGE205_GARENCIERES_001",
      "EFF_209STAGE209_SKYGRASPER_001",
      "EFF_213STAGE213_SPRINKLER_001",
      "EFF_214STAGE214_CLOP_01",
      "EFF_214STAGE214_MUSAKA_01",
      "EFF_214STAGE214_RACAILUM_001"
    ]
  },
  {
    "key": "VDK_ATTACH_EFFECT_0_NODENAME",
    "category": "attach",
    "kind": "string",
    "sampleValues": [
      "ATTACH0"
    ]
  },
  {
    "key": "VDK_ATTACH_EFFECT_1_ID",
    "category": "attach",
    "kind": "string",
    "sampleValues": [
      "EFF_213STAGE213_SPRINKLER_001"
    ]
  },
  {
    "key": "VDK_ATTACH_EFFECT_1_NODENAME",
    "category": "attach",
    "kind": "string",
    "sampleValues": [
      "ATTACH1"
    ]
  },
  {
    "key": "VDK_ATTACH_EFFECT_2_ID",
    "category": "attach",
    "kind": "string",
    "sampleValues": [
      "EFF_213STAGE213_SPRINKLER_001"
    ]
  },
  {
    "key": "VDK_ATTACH_EFFECT_2_NODENAME",
    "category": "attach",
    "kind": "string",
    "sampleValues": [
      "ATTACH2"
    ]
  },
  {
    "key": "VDK_ATTACH_EFFECT_3_ID",
    "category": "attach",
    "kind": "string",
    "sampleValues": [
      "EFF_213STAGE213_SPRINKLER_001"
    ]
  },
  {
    "key": "VDK_ATTACH_EFFECT_3_NODENAME",
    "category": "attach",
    "kind": "string",
    "sampleValues": [
      "ATTACH3"
    ]
  },
  {
    "key": "VDK_ATTACH_EFFECT_4_ID",
    "category": "attach",
    "kind": "string",
    "sampleValues": [
      "EFF_213STAGE213_SPRINKLER_001"
    ]
  },
  {
    "key": "VDK_ATTACH_EFFECT_4_NODENAME",
    "category": "attach",
    "kind": "string",
    "sampleValues": [
      "ATTACH4"
    ]
  },
  {
    "key": "VDK_ATTACH_EFFECT_5_ID",
    "category": "attach",
    "kind": "string",
    "sampleValues": [
      "EFF_213STAGE213_SPRINKLER_001"
    ]
  },
  {
    "key": "VDK_ATTACH_EFFECT_5_NODENAME",
    "category": "attach",
    "kind": "string",
    "sampleValues": [
      "ATTACH5"
    ]
  },
  {
    "key": "VDK_ATTACH_EFFECT_6_ID",
    "category": "attach",
    "kind": "string",
    "sampleValues": [
      "EFF_213STAGE213_SPRINKLER_001"
    ]
  },
  {
    "key": "VDK_ATTACH_EFFECT_6_NODENAME",
    "category": "attach",
    "kind": "string",
    "sampleValues": [
      "ATTACH6"
    ]
  },
  {
    "key": "VDK_ATTACH_EFFECT_7_ID",
    "category": "attach",
    "kind": "string",
    "sampleValues": [
      "EFF_213STAGE213_SPRINKLER_001"
    ]
  },
  {
    "key": "VDK_ATTACH_EFFECT_7_NODENAME",
    "category": "attach",
    "kind": "string",
    "sampleValues": [
      "ATTACH7"
    ]
  },
  {
    "key": "VDK_BREAK_SHOCKWAVE_POWER",
    "category": "physics",
    "kind": "number",
    "sampleValues": [
      "0.0",
      "200.0",
      "1600.0",
      "600.0",
      "300.0",
      "2000.0"
    ]
  },
  {
    "key": "VDK_BREAK_SHOCKWAVE_RADIUS",
    "category": "physics",
    "kind": "number",
    "sampleValues": [
      "0.0",
      "80.0",
      "1000.0",
      "160.0"
    ]
  },
  {
    "key": "VDK_CAMERA_BIND_PLACEMENT",
    "category": "links",
    "kind": "number",
    "sampleValues": [
      "45",
      "46",
      "39",
      "40",
      "57",
      "58"
    ]
  },
  {
    "key": "VDK_CHAINBREAK_PLACEMENT",
    "category": "links",
    "kind": "number",
    "sampleValues": [
      "5",
      "9",
      "8",
      "4",
      "16",
      "17"
    ]
  },
  {
    "key": "VDK_EFFECT_ID",
    "category": "effect",
    "kind": "string",
    "sampleValues": [
      "EFF_201STAGE201_EXP_001",
      "EFF_201STAGE201_AIR_001",
      "EFF_201STAGE201_ELC_001",
      "EFF_201STAGE201_SMOKE_001",
      "EFF_201STAGE201_SMOKE_002",
      "EFF_202STAGE202_EXP_001"
    ]
  },
  {
    "key": "VDK_EFFECT_TIME_OFFSET",
    "category": "effect",
    "kind": "number",
    "sampleValues": [
      "0",
      "360",
      "720",
      "15",
      "70",
      "675"
    ]
  },
  {
    "key": "VDK_HITPOINT",
    "category": "identity",
    "kind": "string",
    "sampleValues": [
      "UNBREAKABLE",
      "MEDIUM"
    ]
  },
  {
    "key": "VDK_INITIAL_SPAWN",
    "category": "identity",
    "kind": "bool",
    "sampleValues": [
      "FALSE",
      "TRUE"
    ]
  },
  {
    "key": "VDK_OBJECTNUMBER",
    "category": "identity",
    "kind": "number",
    "sampleValues": [
      "48",
      "50",
      "25",
      "63",
      "5",
      "6"
    ]
  },
  {
    "key": "VDK_PLACEMENT_NAME",
    "category": "identity",
    "kind": "string",
    "sampleValues": [
      ""
    ]
  },
  {
    "key": "VDK_POSITION_X",
    "category": "transform",
    "kind": "number",
    "sampleValues": [
      "378.537",
      "258.15",
      "413.987",
      "294.31",
      "258.665",
      "-57.097"
    ]
  },
  {
    "key": "VDK_POSITION_Y",
    "category": "transform",
    "kind": "number",
    "sampleValues": [
      "13.929",
      "14.439",
      "13.854",
      "10.8",
      "1.419",
      "11.942"
    ]
  },
  {
    "key": "VDK_POSITION_Z",
    "category": "transform",
    "kind": "number",
    "sampleValues": [
      "173.046",
      "378.281",
      "161.221",
      "-106.832",
      "122.321",
      "-68.932"
    ]
  },
  {
    "key": "VDK_PROGRAMID",
    "category": "identity",
    "kind": "number",
    "sampleValues": [
      "0",
      "1"
    ]
  },
  {
    "key": "VDK_PROP_DISAPPEAR_EFFECT_ID",
    "category": "prop",
    "kind": "string",
    "sampleValues": [
      "EFF_NULL",
      "EFF_000COMMON_000COMMON_001_STAGEBREAK_001"
    ]
  },
  {
    "key": "VDK_PROP_IMPULSE_EFFECT_RESTRAINT_RATIO",
    "category": "prop",
    "kind": "number",
    "sampleValues": [
      "0.0"
    ]
  },
  {
    "key": "VDK_PROP_IMPULSE_EFFECT_SCALE",
    "category": "prop",
    "kind": "number",
    "sampleValues": [
      "1.0"
    ]
  },
  {
    "key": "VDK_PROP_IMPULSE_EFFECT_STRENGTH",
    "category": "prop",
    "kind": "number",
    "sampleValues": [
      "1.0"
    ]
  },
  {
    "key": "VDK_PROP_IMPULSE_EFFECT_STRONG_ID",
    "category": "prop",
    "kind": "string",
    "sampleValues": [
      "EFF_000COMMON_000COMMON_001_STAGESMOKE_001",
      "EFF_NULL",
      "EFF_207STAGE207_STAGESMOKE_001",
      "EFF_207STAGE207_STAGESMOKE_002",
      "EFF_209STAGE209_STAGESMOKE_001"
    ]
  },
  {
    "key": "VDK_PROP_IMPULSE_EFFECT_WEAK_ID",
    "category": "prop",
    "kind": "string",
    "sampleValues": [
      "EFF_000COMMON_000COMMON_001_STAGESMOKE_001",
      "EFF_NULL",
      "EFF_207STAGE207_STAGESMOKE_001",
      "EFF_207STAGE207_STAGESMOKE_002",
      "EFF_209STAGE209_STAGESMOKE_001"
    ]
  },
  {
    "key": "VDK_PROP_LIFE_MAX",
    "category": "prop",
    "kind": "number",
    "sampleValues": [
      "120",
      "90",
      "60"
    ]
  },
  {
    "key": "VDK_PROP_RELEASE_ATTACH",
    "category": "attach",
    "kind": "bool",
    "sampleValues": [
      "TRUE",
      "FALSE"
    ]
  },
  {
    "key": "VDK_ROTATION_X",
    "category": "transform",
    "kind": "number",
    "sampleValues": [
      "0.0",
      "-5.07285239438",
      "-6.01493103634",
      "-6.65098653561",
      "-8.06718644928",
      "-19.6615285931"
    ]
  },
  {
    "key": "VDK_ROTATION_Y",
    "category": "transform",
    "kind": "number",
    "sampleValues": [
      "0.0",
      "90.0",
      "270.0",
      "-17.8",
      "-27.2",
      "0.6"
    ]
  },
  {
    "key": "VDK_ROTATION_Z",
    "category": "transform",
    "kind": "number",
    "sampleValues": [
      "0.0",
      "-0.415682085361",
      "0.762936067467",
      "2.57793915018",
      "3.23652359321",
      "8.01037930375"
    ]
  },
  {
    "key": "VDK_SCALE_X",
    "category": "transform",
    "kind": "number",
    "sampleValues": [
      "1.0",
      "2.0",
      "1.1"
    ]
  },
  {
    "key": "VDK_SCALE_Y",
    "category": "transform",
    "kind": "number",
    "sampleValues": [
      "1.0",
      "2.0",
      "1.1"
    ]
  },
  {
    "key": "VDK_SCALE_Z",
    "category": "transform",
    "kind": "number",
    "sampleValues": [
      "1.0",
      "2.0",
      "1.1"
    ]
  },
  {
    "key": "VDK_SE_ID",
    "category": "effect",
    "kind": "string",
    "sampleValues": [
      "__NULL__",
      "SE_STG_01_BUILDING_EXPLOSION_001"
    ]
  },
  {
    "key": "VDK_SE_TIME_OFFSET",
    "category": "effect",
    "kind": "number",
    "sampleValues": [
      "0"
    ]
  },
  {
    "key": "VDK_SHADOW_CAST",
    "category": "identity",
    "kind": "bool",
    "sampleValues": [
      "FALSE",
      "TRUE"
    ]
  },
  {
    "key": "VDK_SUBSTITUTE_PLACEMENT",
    "category": "links",
    "kind": "number",
    "sampleValues": [
      "37",
      "41",
      "0",
      "42",
      "38",
      "1"
    ]
  },
  {
    "key": "VDK_TYPE",
    "category": "transform",
    "kind": "string",
    "sampleValues": [
      "EFFECT",
      "OBJECT",
      "SKY",
      "PROP"
    ]
  }
];
