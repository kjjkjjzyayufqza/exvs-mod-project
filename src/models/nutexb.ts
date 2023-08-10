import { DDSFormat } from "./dds";

export interface NutexbFileModel {
  Height: number;
  Width: number;
  Format: DDSFormat;
  Depth: number;
  MipCount: number;
  ArrayCount: number;
  ImageSize: number;
  Name: string;
}
