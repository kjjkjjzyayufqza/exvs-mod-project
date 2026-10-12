/**
 * Runtime names for character NUMATB parameters.
 *
 * The ParamId discriminants and the uniform strings are registered together in
 * OB `sub_1401369C0` (`vsac27_Release.exe`, image base `0x140000000`).
 * Legacy ParamIds that are not in that table keep their own names.
 */
export type NumatbParamEditorKind = "color" | "float" | "vector" | "bool" | "integer";

export type NumatbParamSemantic = {
  uniform: string;
  editor: NumatbParamEditorKind;
  /** One line shown under the param id in the material editor. */
  summary: string;
};

export const NUMATB_PARAM_SEMANTICS: Readonly<Record<string, NumatbParamSemantic>> = {
  CustomColor0: {
    uniform: "GBufferDiffuseMultiply",
    editor: "color",
    summary: "Multiplies the deferred diffuse color. Black leaves the albedo unchanged.",
  },
  CustomColor1: {
    uniform: "GBufferEmissiveColorMultiply",
    editor: "color",
    summary: "Multiplies the emissive color. White is the identity multiply.",
  },
  CustomColor2: {
    uniform: "GBufferDamage",
    editor: "color",
    summary: "Damage tint written into the G-buffer. Black is the registered default.",
  },
  CustomVector0: {
    uniform: "RimlightColor",
    editor: "color",
    summary: "Rim-light color. Stored as XYZW; W is alpha.",
  },
  CustomVector1: {
    uniform: "OutlineColor",
    editor: "color",
    summary: "Outline color. Stored as XYZW; W is alpha.",
  },
  CustomVector2: {
    uniform: "GBufferParamEx1",
    editor: "vector",
    summary: "Extra G-buffer vector. Per-component meaning is not proven.",
  },
  CustomVector3: {
    uniform: "CharaParamEx1",
    editor: "vector",
    summary: "Extra character vector. Per-component meaning is not proven.",
  },
  CustomFloat0: {
    uniform: "FresnelBias",
    editor: "float",
    summary: "Fresnel bias. Shipped bodies store 0.1, matching the runtime default fill.",
  },
  CustomFloat1: {
    uniform: "FresnelPower",
    editor: "float",
    summary: "Fresnel power. Identity default is 1.",
  },
  CustomFloat2: {
    uniform: "ReflectionScale",
    editor: "float",
    summary: "Scales the reflection / cube-map response. Identity default is 1.",
  },
  CustomFloat3: {
    uniform: "GBufferSpecularMultiply",
    editor: "float",
    summary: "Multiplies specular intensity. Identity default is 1.",
  },
  CustomFloat4: {
    uniform: "GBufferRoughnessMultiply",
    editor: "float",
    summary: "Multiplies roughness. Identity default is 1.",
  },
  CustomFloat5: {
    uniform: "RimlightPower",
    editor: "float",
    summary: "Rim-light power. 0 disables the registered default.",
  },
  CustomFloat6: {
    uniform: "DiscardRatio",
    editor: "float",
    summary: "Discard ratio used by fade and quantize-style character shaders.",
  },
  CustomFloat7: {
    uniform: "GBufferParamEx2",
    editor: "float",
    summary: "Extra G-buffer scalar. Identity default is 1.",
  },
  CustomFloat8: {
    uniform: "FresnelRatio",
    editor: "float",
    summary: "Fresnel ratio. Identity default is 1.",
  },
  CustomFloat9: {
    uniform: "CharaParamEx2",
    editor: "float",
    summary: "Extra character scalar. Identity default is 1.",
  },
  CustomFloat12: {
    uniform: "FadeoutRatio",
    editor: "float",
    summary: "Fade-out ratio for vsngCharaFadeout-style materials.",
  },
  CustomFloat14: {
    uniform: "QuantizeRatio",
    editor: "float",
    summary: "Quantize ratio for vsngCharaQuantize-style materials.",
  },
  CustomInteger0: {
    uniform: "EnableAwakening",
    editor: "integer",
    summary: "Awakening switch. Stored on disk as Float 0 or 1, applied as a boolean uniform.",
  },
  CustomBoolean0: {
    uniform: "IsDiffuseHSV",
    editor: "bool",
    summary: "When set, CustomColor0 is read as HSV instead of RGB.",
  },
  CustomBoolean1: {
    uniform: "IsSpecularHSV",
    editor: "bool",
    summary: "When set, the specular tint is read as HSV instead of RGB.",
  },
  CustomBoolean2: {
    uniform: "changeDirection",
    editor: "bool",
    summary: "Direction flag consumed by sparkle-style character materials.",
  },
  Diffuse: {
    uniform: "Diffuse",
    editor: "color",
    summary: "Authoring color on the Maya profile. Character runtime profiles use CustomColor0 instead.",
  },
  Specular: {
    uniform: "Specular",
    editor: "color",
    summary: "Authoring specular color on the Maya profile.",
  },
  EmissiveScale: {
    uniform: "EmissiveScale",
    editor: "float",
    summary: "Legacy emissive intensity. Not remapped through the Custom* table.",
  },
};

export function numatbParamSemantic(paramId: string): NumatbParamSemantic | undefined {
  return NUMATB_PARAM_SEMANTICS[paramId];
}
