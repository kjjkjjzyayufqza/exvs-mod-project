import type { EfxbnEffectSummary } from "@/services/effectFolder/effectFolderService";

/**
 * The editable field surface of an EFXBN block.
 *
 * Ranked by what shipped files actually author. A corpus scan over 7,269 blocks found **70 of the
 * 220 `u32` lanes are constant across every shipped file** — those are still written back verbatim
 * (correctness demands it) but they do not deserve prime screen space, so they carry
 * `rarelyAuthored` and collapse into their own section.
 *
 * The 18 animation curves are deliberately **not** here. They are `controlReferences`, edited
 * through `efxbnDocument`'s curve commands, because a curve is a key range rather than a value.
 */

export type EfxbnFieldGroup =
  | "emission"
  | "shape"
  | "transform"
  | "material"
  | "render"
  | "strip"
  | "viewRamp"
  | "animation"
  | "rare";

export const EFXBN_FIELD_GROUP_LABELS: Readonly<Record<EfxbnFieldGroup, string>> = {
  emission: "Emission",
  shape: "Spawn shape",
  transform: "Transform",
  material: "Material",
  render: "Render state",
  strip: "Strip",
  viewRamp: "View-angle ramp",
  animation: "Model animation",
  rare: "Rarely authored",
};

/** Field keys the editor may write. Everything else round-trips untouched. */
export type EfxbnEditableFieldKey = Exclude<
  keyof EfxbnEffectSummary,
  | "index"
  | "level"
  | "childIndexSize"
  | "childIndexArray"
  | "referencedEffectIndex"
  | "internalElementDataIndex"
  | "controlReferences"
  | "reserveArea"
  | "runtime"
  | "modelHash"
  | "animationHash"
  | "pad01"
>;

export type EfxbnFieldOption = { value: number; label: string };

export type EfxbnFieldDescriptor = {
  key: EfxbnEditableFieldKey;
  /** Component index for vector fields; omitted for scalars. */
  component?: number;
  label: string;
  group: EfxbnFieldGroup;
  kind: "float" | "int" | "enum" | "flags" | "hash";
  /** Block offset, so a value can always be traced back to the bytes it writes. */
  offset: number;
  options?: readonly EfxbnFieldOption[];
  /** Named bits for `kind: "flags"`. Unnamed bits stay numbered — no invented names. */
  bits?: readonly { mask: number; label: string; note?: string }[];
  /** True when no shipped block varies this lane. Collapsed, never hidden. */
  rarelyAuthored?: boolean;
  hint?: string;
};

const ELEMENT_TYPE_OPTIONS: readonly EfxbnFieldOption[] = [
  { value: 1, label: "1 — Billboard" },
  { value: 3, label: "3 — Model" },
  { value: 5, label: "5 — Strip" },
  { value: 6, label: "6 — container" },
  { value: 8, label: "8 — container" },
  { value: 9, label: "9 — wrapper (adopts its first child)" },
  { value: 10, label: "10 — container" },
  { value: 11, label: "11 — container" },
];

const BLEND_STATE_OPTIONS: readonly EfxbnFieldOption[] = [
  { value: 0, label: "0 — opaque (ONE / ZERO)" },
  { value: 1, label: "1 — alpha (SRC_ALPHA / INV_SRC_ALPHA)" },
  { value: 2, label: "2 — additive (SRC_ALPHA / ONE)" },
  { value: 4, label: "4 — premultiplied (ONE / INV_SRC_ALPHA)" },
];

const CULLING_TYPE_OPTIONS: readonly EfxbnFieldOption[] = [
  { value: 0, label: "0 — no culling" },
  { value: 1, label: "1 — cull back faces" },
  { value: 2, label: "2 — cull front faces" },
];

const SPAWN_FORM_OPTIONS: readonly EfxbnFieldOption[] = [
  { value: 0, label: "0 — point / sphere" },
  { value: 2, label: "2 — ring" },
  { value: 3, label: "3 — cylinder" },
  { value: 4, label: "4 — box" },
  { value: 5, label: "5 — sphere" },
  { value: 7, label: "7 — curve-driven (undecoded)" },
  { value: 8, label: "8 — box" },
  { value: 9, label: "9 — mesh surface" },
  { value: 10, label: "10 — mesh surface" },
];

const EMIT_AREA_OPTIONS: readonly EfxbnFieldOption[] = [
  { value: 0, label: "0 — shell" },
  { value: 1, label: "1 — uniform over area" },
];

const BOOL_OPTIONS: readonly EfxbnFieldOption[] = [
  { value: 0, label: "0 — off" },
  { value: 1, label: "1 — on" },
];

/**
 * `actionFlags` bits with a derived meaning. 444 distinct values are authored across 90.6% of
 * blocks, so a hex box would be unusable — but only bits with a proven meaning get a name.
 */
const ACTION_FLAG_BITS = [
  { mask: 0x1, label: "loop", note: "wraps the particle's curve phase instead of expiring it" },
  { mask: 0x10, label: "uniform size", note: "copies the randomised X size into Y and Z" },
  { mask: 0x0080_0000, label: "clears loop", note: "normalizer drops bit 0 and deleteSettings bit 1" },
  { mask: 0x0800_0000, label: "forces loop", note: "normalizer sets bit 0" },
] as const;

function vector(
  key: EfxbnEditableFieldKey,
  label: string,
  group: EfxbnFieldGroup,
  offset: number,
  components: readonly string[],
  extra: Partial<EfxbnFieldDescriptor> = {},
): EfxbnFieldDescriptor[] {
  return components.map((suffix, component) => ({
    key,
    component,
    label: `${label}.${suffix}`,
    group,
    kind: "float",
    offset: offset + component * 4,
    ...extra,
  }));
}

const XYZW = ["x", "y", "z", "w"] as const;
const RGBA = ["r", "g", "b", "a"] as const;

export const EFXBN_FIELD_SCHEMA: readonly EfxbnFieldDescriptor[] = [
  // ---- Emission -----------------------------------------------------------------------------
  { key: "effectType", label: "Element type", group: "emission", kind: "enum", offset: 0x28,
    options: ELEMENT_TYPE_OPTIONS,
    hint: "Type 9 wrappers adopt a type from their first child at load time." },
  { key: "lifeTimeBase", label: "Life time", group: "emission", kind: "float", offset: 0x2c },
  { key: "lifeTimeRandom", label: "Life time random", group: "emission", kind: "float", offset: 0x30 },
  { key: "intervalBase", label: "Emit interval", group: "emission", kind: "float", offset: 0x34 },
  { key: "intervalRandom", label: "Interval random", group: "emission", kind: "float", offset: 0x38 },
  { key: "numEmit", label: "Emit count", group: "emission", kind: "int", offset: 0x3c },
  { key: "numEmitCountRandom", label: "Emit count random", group: "emission", kind: "int", offset: 0x2b8 },
  { key: "delayEmitTimeBase", label: "Emit delay", group: "emission", kind: "float", offset: 0x1a0 },
  { key: "actionFlags", label: "Action flags", group: "emission", kind: "flags", offset: 0x40,
    bits: ACTION_FLAG_BITS },
  { key: "fadeTimeBase", label: "Fade time", group: "emission", kind: "float", offset: 0x16c },
  { key: "deleteSettings", label: "Delete settings", group: "emission", kind: "int", offset: 0x168 },
  { key: "emitInterpolateType", label: "Emit interpolate type", group: "emission", kind: "int", offset: 0x2f0 },
  { key: "emitInterpolateDistance", label: "Emit interpolate distance", group: "emission", kind: "float", offset: 0x264 },
  { key: "emitterLodType", label: "Emitter LOD type", group: "emission", kind: "int", offset: 0x28c },

  // ---- Spawn shape --------------------------------------------------------------------------
  { key: "spawnFormType", label: "Spawn form", group: "shape", kind: "enum", offset: 0x44,
    options: SPAWN_FORM_OPTIONS },
  ...vector("spawnFormLength", "Spawn form length", "shape", 0x48, XYZW),
  { key: "emitAreaType", label: "Emit area", group: "shape", kind: "enum", offset: 0x1a4,
    options: EMIT_AREA_OPTIONS },
  ...vector("positionOffset", "Position offset", "shape", 0x190, XYZW),
  { key: "meshEmitterIndex", label: "Mesh emitter index", group: "shape", kind: "int", offset: 0x2c8 },
  { key: "meshEmitterCount", label: "Mesh emitter count", group: "shape", kind: "int", offset: 0x2cc },

  // ---- Transform ----------------------------------------------------------------------------
  ...vector("sizeBase", "Size", "transform", 0xf0, XYZW),
  ...vector("sizeRandom", "Size random", "transform", 0x100, XYZW),
  ...vector("rotationBase", "Rotation", "transform", 0x110, XYZW),
  ...vector("rotationRandom", "Rotation random", "transform", 0x120, XYZW),
  ...vector("rotationSpeed", "Rotation speed", "transform", 0x130, XYZW),
  ...vector("rotationSpeedRandom", "Rotation speed random", "transform", 0x240, XYZW),
  ...vector("speedRandom", "Speed random", "transform", 0xe0, XYZW),
  ...vector("centerPivot", "Centre pivot", "transform", 0x160, ["x", "y"]),
  ...vector("deleteEndScale", "Delete end scale", "transform", 0x1ac, XYZW),

  // ---- Material -----------------------------------------------------------------------------
  { key: "nudHandle", label: "Model handle", group: "material", kind: "hash", offset: 0x140,
    hint: "Rebind with the model picker; a raw edit here must match a resolvable model hash." },
  { key: "textureHandle", label: "Texture handle", group: "material", kind: "hash", offset: 0x148 },
  { key: "colorTextureParameterIndex", component: 0, label: "Colour map slot", group: "material",
    kind: "int", offset: 0x150 },
  { key: "colorTextureParameterIndex", component: 1, label: "Pass-2 colour slot", group: "material",
    kind: "int", offset: 0x154 },
  { key: "uvTextureParameterIndex", component: 0, label: "UV offset slot", group: "material",
    kind: "int", offset: 0x158 },
  { key: "uvTextureParameterIndex", component: 1, label: "Pass-2 UV offset slot", group: "material",
    kind: "int", offset: 0x15c },
  { key: "normalMapHash", label: "Normal map hash", group: "material", kind: "hash", offset: 0x1c8 },
  { key: "lightingFlags", label: "Lighting flags", group: "material", kind: "int", offset: 0x1c4 },
  { key: "lightType", label: "Light type", group: "material", kind: "int", offset: 0x238 },
  { key: "lightBaseRadius", label: "Light base radius", group: "material", kind: "float", offset: 0x23c },
  { key: "lightAttenuationRadius", label: "Light attenuation radius", group: "material", kind: "float", offset: 0x1c0 },
  { key: "reflectionPower", label: "Reflection power", group: "material", kind: "float", offset: 0x274 },
  { key: "highlightPower", label: "Highlight power", group: "material", kind: "float", offset: 0x2ec },

  // ---- Render state -------------------------------------------------------------------------
  { key: "blendState", label: "Blend state", group: "render", kind: "enum", offset: 0x17c,
    options: BLEND_STATE_OPTIONS,
    hint: "State 3 occurs in zero shipped files and is rejected by the renderer." },
  { key: "cullingType", label: "Culling", group: "render", kind: "enum", offset: 0x170,
    options: CULLING_TYPE_OPTIONS },
  { key: "zWriteEnable", label: "Depth write", group: "render", kind: "enum", offset: 0x174,
    options: BOOL_OPTIONS,
    hint: "The loader overrides this: blendState 0 forces it on, soft particles force it off." },
  { key: "zTestEnable", label: "Depth test", group: "render", kind: "enum", offset: 0x178,
    options: BOOL_OPTIONS },
  { key: "enableSoftParticle", label: "Soft particle", group: "render", kind: "enum", offset: 0x18c,
    options: BOOL_OPTIONS },
  { key: "softParticleRange", label: "Soft particle range", group: "render", kind: "float", offset: 0x1fc,
    hint: "An authored 0 becomes 8 at load time." },
  { key: "cameraFadeRange", label: "Camera fade range", group: "render", kind: "float", offset: 0x200 },
  { key: "enableZSort", label: "Depth sort", group: "render", kind: "enum", offset: 0x1a8,
    options: BOOL_OPTIONS },
  { key: "zSortOffset", label: "Depth sort offset", group: "render", kind: "float", offset: 0x26c },
  { key: "extraFlags", label: "Extra flags", group: "render", kind: "flags", offset: 0x204,
    bits: [
      { mask: 0x2000, label: "full brightness", note: "skips the rgb * 0.5 the base pixel shader applies" },
      { mask: 0x40000, label: "soft colour term", note: "draw-scheme 0x10000; its constants are undecoded" },
    ] },
  { key: "drawerId", label: "Drawer id", group: "render", kind: "int", offset: 0x1f4 },
  { key: "drawRepositoryIndex", label: "Draw repository index", group: "render", kind: "int", offset: 0x180 },
  { key: "drawAmountIndex", label: "Draw amount index", group: "render", kind: "int", offset: 0x188 },
  { key: "instanceAmountType", label: "Instance amount type", group: "render", kind: "int", offset: 0x184 },
  { key: "pass2BlendType", label: "Pass-2 blend type", group: "render", kind: "int", offset: 0x278 },
  { key: "specialShaderType", label: "Special shader type", group: "render", kind: "int", offset: 0x270 },
  { key: "depthEmissionRange", label: "Depth emission range", group: "render", kind: "float", offset: 0x2e4 },
  { key: "depthEmissionPower", label: "Depth emission power", group: "render", kind: "float", offset: 0x2e8 },

  // ---- Strip --------------------------------------------------------------------------------
  { key: "stripSegmentInterval", label: "Segment interval", group: "strip", kind: "float", offset: 0x1e0 },
  { key: "stripSegmentLife", label: "Segment life", group: "strip", kind: "float", offset: 0x1e8,
    hint: "A negative value becomes stripSegmentInterval * 16 at load time." },
  { key: "stripSegmentSplitNum", label: "Segment split count", group: "strip", kind: "int", offset: 0x1f0 },
  { key: "stripTailAlphaRate", label: "Tail alpha rate", group: "strip", kind: "float", offset: 0x25c },
  { key: "stripHeadAlphaRate", label: "Head alpha rate", group: "strip", kind: "float", offset: 0x260 },

  // ---- View-angle ramp ----------------------------------------------------------------------
  ...vector("blurStartColor", "Ramp start", "viewRamp", 0x210, RGBA),
  ...vector("blurEndColor", "Ramp end", "viewRamp", 0x220, RGBA),
  { key: "blurEnableRange", label: "Ramp threshold", group: "viewRamp", kind: "float", offset: 0x230 },
  { key: "blurFadePower", label: "Ramp power", group: "viewRamp", kind: "float", offset: 0x234 },

  // ---- Model animation ----------------------------------------------------------------------
  { key: "animationId", label: "Animation handle", group: "animation", kind: "hash", offset: 0x290 },
  { key: "animationStartFrame", label: "Start frame", group: "animation", kind: "float", offset: 0x2a8 },
  { key: "animationDelayFrame", label: "Delay frame", group: "animation", kind: "float", offset: 0x27c },
  { key: "animationLoopStartFrame", label: "Loop start", group: "animation", kind: "float", offset: 0x280 },
  { key: "animationLoopEndFrame", label: "Loop end", group: "animation", kind: "float", offset: 0x284 },
  { key: "animationDeleteFrame", label: "Delete frame", group: "animation", kind: "float", offset: 0x288 },
  { key: "animationSpeedRate", label: "Speed rate", group: "animation", kind: "float", offset: 0x294 },
  { key: "animationBlendDeleteFrame", label: "Blend delete frame", group: "animation", kind: "float", offset: 0x298 },

  // ---- Rarely authored ----------------------------------------------------------------------
  { key: "fieldEffectType", label: "Field effect type", group: "rare", kind: "int", offset: 0x2d0,
    rarelyAuthored: true,
    hint: "Zero in every shipped file; the four field-effect shaders describe unused behaviour." },
  { key: "fieldEffectPower", label: "Field effect power", group: "rare", kind: "float", offset: 0x2d4, rarelyAuthored: true },
  { key: "fieldEffectInterval", label: "Field effect interval", group: "rare", kind: "float", offset: 0x2d8, rarelyAuthored: true },
  { key: "fieldEffectAngle", label: "Field effect angle", group: "rare", kind: "float", offset: 0x2dc, rarelyAuthored: true },
  { key: "fieldEffectFrequency", label: "Field effect frequency", group: "rare", kind: "float", offset: 0x2e0, rarelyAuthored: true },
  { key: "fieldEffectOffset", label: "Field effect offset", group: "rare", kind: "float", offset: 0x2f4, rarelyAuthored: true },
  { key: "fieldEffectRecieveRate", label: "Field effect receive rate", group: "rare", kind: "float", offset: 0x2f8, rarelyAuthored: true },
  { key: "fieldEffectExtraValue1", label: "Field effect extra 1", group: "rare", kind: "float", offset: 0x2fc, rarelyAuthored: true },
  { key: "worldWindApplyRate", label: "World wind rate", group: "rare", kind: "float", offset: 0x1d8 + 0x4, rarelyAuthored: true },
  { key: "worldWindApplyRateRandom", label: "World wind rate random", group: "rare", kind: "float", offset: 0x1f8, rarelyAuthored: true },
  { key: "worldWaterApplyRate", label: "World water rate", group: "rare", kind: "float", offset: 0x2b4, rarelyAuthored: true },
  { key: "noiseDirectionMaxRot", label: "Noise max rotation", group: "rare", kind: "float", offset: 0x208, rarelyAuthored: true },
  { key: "noiseDirectionAreaRange", label: "Noise area range", group: "rare", kind: "float", offset: 0x20c, rarelyAuthored: true },
  { key: "noiseRotatePosOffset", label: "Noise rotate offset", group: "rare", kind: "float", offset: 0x268, rarelyAuthored: true },
  { key: "cameraOffset", label: "Camera offset", group: "rare", kind: "float", offset: 0x250, rarelyAuthored: true },
  { key: "postEffectType", label: "Post effect type", group: "rare", kind: "int", offset: 0x254, rarelyAuthored: true },
  { key: "postEffectBlendRate", label: "Post effect blend rate", group: "rare", kind: "float", offset: 0x258, rarelyAuthored: true },
  { key: "postEffectShapeRadius", label: "Post effect shape radius", group: "rare", kind: "float", offset: 0x2b0, rarelyAuthored: true },
  { key: "enableDataFlag", label: "Enable data flag", group: "rare", kind: "int", offset: 0x13c, rarelyAuthored: true },
  { key: "deleteEffectId", label: "Delete effect id", group: "rare", kind: "int", offset: 0x1bc, rarelyAuthored: true },
  { key: "stripSegmentLengthNotUse", label: "Segment length (unused)", group: "rare", kind: "float",
    offset: 0x1e4, rarelyAuthored: true, hint: "Declared by the engine and never read." },
  { key: "stripSegmentNumNotUse", label: "Segment count (unused)", group: "rare", kind: "int",
    offset: 0x1ec, rarelyAuthored: true, hint: "Declared by the engine and never read." },
  ...vector("boundingSphereInfo", "Bounding sphere", "rare", 0x2a0, XYZW, { rarelyAuthored: true }),
  { key: "modelId", label: "Model id (mirrors the handle)", group: "rare", kind: "hash", offset: 0x140,
    rarelyAuthored: true },
];

/** Descriptors for one group, in schema order. */
export function efxbnFieldsInGroup(group: EfxbnFieldGroup): EfxbnFieldDescriptor[] {
  return EFXBN_FIELD_SCHEMA.filter((field) => field.group === group);
}

/** Every group that has at least one field, in display order. */
export const EFXBN_FIELD_GROUP_ORDER: readonly EfxbnFieldGroup[] = [
  "emission",
  "shape",
  "transform",
  "material",
  "render",
  "strip",
  "viewRamp",
  "animation",
  "rare",
];

/** Stable identity for a field, used as a React key and as a dirty-tracking key. */
export function efxbnFieldId(field: Pick<EfxbnFieldDescriptor, "key" | "component">): string {
  return field.component === undefined ? field.key : `${field.key}.${field.component}`;
}

/** Reads a descriptor's current value out of a block. */
export function readEfxbnField(
  block: EfxbnEffectSummary,
  field: Pick<EfxbnFieldDescriptor, "key" | "component">,
): number {
  const raw = block[field.key];
  if (field.component === undefined) {
    if (typeof raw !== "number") {
      throw new Error(`EFXBN field ${field.key} is not a scalar`);
    }
    return raw;
  }
  if (!Array.isArray(raw)) {
    throw new Error(`EFXBN field ${field.key} is not a vector`);
  }
  const value = raw[field.component];
  if (typeof value !== "number") {
    throw new Error(`EFXBN field ${field.key}[${field.component}] is out of range`);
  }
  return value;
}
