/**
 * DDS format options supported by image_dds crate.
 * Used for nutexb conversion (PNG -> DDS -> nutexb).
 */
export const DDS_FORMATS = [
  { value: "R8Unorm", label: "R8Unorm" },
  { value: "Rgba8Unorm", label: "Rgba8Unorm" },
  { value: "Rgba8UnormSrgb", label: "Rgba8UnormSrgb" },
  { value: "Bgra8Unorm", label: "Bgra8Unorm" },
  { value: "Bgra8UnormSrgb", label: "Bgra8UnormSrgb" },
  { value: "BC1RgbaUnorm", label: "BC1RgbaUnorm" },
  { value: "BC1RgbaUnormSrgb", label: "BC1RgbaUnormSrgb" },
  { value: "BC2RgbaUnorm", label: "BC2RgbaUnorm" },
  { value: "BC2RgbaUnormSrgb", label: "BC2RgbaUnormSrgb" },
  { value: "BC3RgbaUnorm", label: "BC3RgbaUnorm" },
  { value: "BC3RgbaUnormSrgb", label: "BC3RgbaUnormSrgb" },
  { value: "BC4RUnorm", label: "BC4RUnorm" },
  { value: "BC4RSnorm", label: "BC4RSnorm" },
  { value: "BC5RgUnorm", label: "BC5RgUnorm" },
  { value: "BC5RgSnorm", label: "BC5RgSnorm" },
  { value: "BC6hRgbUfloat", label: "BC6hRgbUfloat" },
  { value: "BC6hRgbSfloat", label: "BC6hRgbSfloat" },
  { value: "BC7RgbaUnorm", label: "BC7RgbaUnorm" },
  { value: "BC7RgbaUnormSrgb", label: "BC7RgbaUnormSrgb" },
] as const;

/** Union of every DDS format value string supported above. */
export type DdsFormat = (typeof DDS_FORMATS)[number]["value"];
