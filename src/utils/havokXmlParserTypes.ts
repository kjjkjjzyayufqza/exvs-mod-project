export interface HavokAabb {
  min: [number, number, number];
  max: [number, number, number];
}

export interface HavokBodyInfo {
  name: string;
  position: [number, number, number];
  orientation: [number, number, number, number];
}

export interface HavokMeshData {
  vertices: [number, number, number][];
  quads: [number, number, number, number][];
  aabb: HavokAabb | null;
  bodies: HavokBodyInfo[];
}

export interface HavokSection {
  codecParms: number[];
  firstPackedVertexIndex: number;
  firstSharedVertexIndex: number;
  firstPrimitiveIndex: number;
  numPackedVertices: number;
  numPrimitives: number;
}
