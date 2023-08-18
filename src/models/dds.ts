import { Buffer } from "buffer";
import { NUTEXImageFormat } from "./nutexb";

export enum DDSFormat {
  B8G8R8A8_UNORM_SRGB,
  B8G8R8A8_UNORM,
  BC1_UNORM_SRGB,
  BC1_UNORM,
  BC2_UNORM_SRGB,
  BC2_UNORM,
  BC3_UNORM,
  BC3_UNORM_SRGB,
  BC4_UNORM,
  BC4_SNORM,
  BC5_UNORM,
  BC5_SNORM,
  BC6H_UF16,
  BC6H_SF16,
  BC7_UNORM,
  BC7_UNORM_SRGB,
  R32G32B32A32_FLOAT,
  R8G8B8A8_UNORM_SRGB,
  R8G8B8A8_UNORM,
}

export interface DDsFileModel {
  Height: number;
  Width: number;
  Format: DDSFormat;
  Depth: number;
  MipCount: number;
  ArrayCount: number;
  ImageSize: number;
  Name: string;
  Buffer: Buffer;
}

export function ConvertGenericToNutFormat(nutFormat: DDSFormat) {
  switch (nutFormat) {
    case DDSFormat.B8G8R8A8_UNORM_SRGB:
      return NUTEXImageFormat.B8G8R8A8_SRGB;
    case DDSFormat.B8G8R8A8_UNORM:
      return NUTEXImageFormat.B8G8R8A8_UNORM;
    case DDSFormat.BC1_UNORM_SRGB:
      return NUTEXImageFormat.BC1_SRGB;
    case DDSFormat.BC1_UNORM:
      return NUTEXImageFormat.BC1_UNORM;
    case DDSFormat.BC2_UNORM:
      return NUTEXImageFormat.BC2_UNORM;
    case DDSFormat.BC3_UNORM:
      return NUTEXImageFormat.BC3_UNORM;
    case DDSFormat.BC3_UNORM_SRGB:
      return NUTEXImageFormat.BC3_SRGB;
    case DDSFormat.BC4_UNORM:
      return NUTEXImageFormat.BC4_UNORM;
    case DDSFormat.BC4_SNORM:
      return NUTEXImageFormat.BC4_SNORM;
    case DDSFormat.BC5_UNORM:
      return NUTEXImageFormat.BC5_UNORM;
    case DDSFormat.BC5_SNORM:
      return NUTEXImageFormat.BC5_SNORM;
    case DDSFormat.BC6H_UF16:
      return NUTEXImageFormat.BC6_UFLOAT;
    case DDSFormat.BC6H_SF16:
      return NUTEXImageFormat.BC6_SFLOAT;
    case DDSFormat.BC7_UNORM:
      return NUTEXImageFormat.BC7_UNORM;
    case DDSFormat.BC7_UNORM_SRGB:
      return NUTEXImageFormat.BC7_SRGB;
    case DDSFormat.R32G32B32A32_FLOAT:
      return NUTEXImageFormat.R32G32B32A32_FLOAT;
    case DDSFormat.R8G8B8A8_UNORM_SRGB:
      return NUTEXImageFormat.R8G8B8A8_SRGB;
    case DDSFormat.R8G8B8A8_UNORM:
      return NUTEXImageFormat.R8G8B8A8_UNORM;
    default:
      throw `Cannot convert format ${nutFormat}`;
  }
}

export function ConvertFormat(nutFormat: NUTEXImageFormat) {
  switch (nutFormat) {
    case NUTEXImageFormat.B8G8R8A8_SRGB:
      return DDSFormat.B8G8R8A8_UNORM_SRGB;
    case NUTEXImageFormat.B8G8R8A8_UNORM:
      return DDSFormat.B8G8R8A8_UNORM;
    case NUTEXImageFormat.BC1_SRGB:
      return DDSFormat.BC1_UNORM_SRGB;
    case NUTEXImageFormat.BC1_UNORM:
      return DDSFormat.BC1_UNORM;
    case NUTEXImageFormat.BC2_UNORM:
      return DDSFormat.BC2_UNORM;
    case NUTEXImageFormat.BC2_SRGB:
      return DDSFormat.BC2_UNORM_SRGB;
    case NUTEXImageFormat.BC3_UNORM:
      return DDSFormat.BC3_UNORM;
    case NUTEXImageFormat.BC3_SRGB:
      return DDSFormat.BC3_UNORM_SRGB;
    case NUTEXImageFormat.BC4_UNORM:
      return DDSFormat.BC4_UNORM;
    case NUTEXImageFormat.BC4_SNORM:
      return DDSFormat.BC4_SNORM;
    case NUTEXImageFormat.BC5_UNORM:
      return DDSFormat.BC5_UNORM;
    case NUTEXImageFormat.BC5_SNORM:
      return DDSFormat.BC5_SNORM;
    case NUTEXImageFormat.BC6_UFLOAT:
      return DDSFormat.BC6H_UF16;
    case NUTEXImageFormat.BC6_SFLOAT:
      return DDSFormat.BC6H_SF16;
    case NUTEXImageFormat.BC7_UNORM:
      return DDSFormat.BC7_UNORM;
    case NUTEXImageFormat.BC7_SRGB:
      return DDSFormat.BC7_UNORM_SRGB;
    case NUTEXImageFormat.R32G32B32A32_FLOAT:
      return DDSFormat.R32G32B32A32_FLOAT;
    case NUTEXImageFormat.R8G8B8A8_SRGB:
      return DDSFormat.R8G8B8A8_UNORM_SRGB;
    case NUTEXImageFormat.R8G8B8A8_UNORM:
      return DDSFormat.R8G8B8A8_UNORM;
    default:
      throw `Cannot convert format ${nutFormat}`;
  }
}
