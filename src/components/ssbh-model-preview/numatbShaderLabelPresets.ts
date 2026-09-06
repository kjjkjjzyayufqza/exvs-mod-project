/** Default shader_label choices shown in every numatb shader picker. Typed values still override. */
export const NUMATB_SHADER_LABEL_PRESETS = ["vsngCharaBasic", "FeStandard"] as const;

export function numatbShaderLabelOptions(currentLabel?: string): string[] {
  const current = currentLabel?.trim();
  if (!current) {
    return [...NUMATB_SHADER_LABEL_PRESETS];
  }
  const currentKey = current.toLowerCase();
  if (NUMATB_SHADER_LABEL_PRESETS.some((preset) => preset.toLowerCase() === currentKey)) {
    return [...NUMATB_SHADER_LABEL_PRESETS];
  }
  return [...NUMATB_SHADER_LABEL_PRESETS, current];
}
