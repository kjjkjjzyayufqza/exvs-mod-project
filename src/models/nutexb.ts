import { DDsFileModel } from "./dds";

export interface NutexbFileModel extends DDsFileModel {
  Padding2: number;
  Padding3: number;
  Unk2: number;
  Alignment: number;
  Version: number;
  MipSizes: any[];
}

export enum NUTEXImageFormat {
  R8G8B8A8_UNORM = 0x0400,
  R8G8B8A8_SRGB = 0x0405,
  R32G32B32A32_FLOAT = 0x0434,
  B8G8R8A8_UNORM = 0x0450,
  B8G8R8A8_SRGB = 0x0455,
  BC1_UNORM = 0x0480,
  BC1_SRGB = 0x0485,
  BC2_UNORM = 0x0490,
  BC2_SRGB = 0x0495,
  BC3_UNORM = 0x04a0,
  BC3_SRGB = 0x04a5,
  BC4_UNORM = 0x0180,
  BC4_SNORM = 0x0185,
  BC5_UNORM = 0x0280,
  BC5_SNORM = 0x0285,
  BC6_UFLOAT = 0x04d7,
  BC6_SFLOAT = 0x04d8,
  BC7_UNORM = 0x04e0,
  BC7_SRGB = 0x04e5,
}
