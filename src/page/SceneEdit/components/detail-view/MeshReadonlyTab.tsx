import { useCallback, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { MeshDataJson, MeshObjectJson } from "@/components/ssbh-model-preview/types";

const VIRTUALIZE_ROW_THRESHOLD = 40;
const ROW_HEIGHT = 28;

type MeshReadonlyTabProps = {
  mesh: unknown | null;
};

export type MeshObjectStats = {
  vertexCount: number;
  triangleCount: number;
  uvChannels: number;
  /** Null when a binary mesh object carries no bone influence data (rendered as "-"). */
  boneInfluences: number | null;
};

export function getMeshObjectStats(obj: MeshObjectJson): MeshObjectStats {
  const bin = obj.__bin;
  if (bin) {
    // Binary side-channel geometry: typed-array views attached by hydrateBundleGeometry.
    // Inline arrays are absent for these objects, so stats come from the views
    // (positions are packed xyz triplets; uv views exist per packed channel).
    return {
      vertexCount: bin.positions ? bin.positions.length / 3 : 0,
      triangleCount: Math.floor(bin.indices.length / 3),
      uvChannels: (bin.uv0 ? 1 : 0) + (bin.uv1 ? 1 : 0),
      boneInfluences: obj.bone_influences ? obj.bone_influences.length : null,
    };
  }
  const vertexCount = obj.positions?.[0]
    ? getVectorDataCount(obj.positions[0].data)
    : 0;
  const triangleCount = Math.floor((obj.vertex_indices?.length ?? 0) / 3);
  const uvChannels = obj.texture_coordinates?.length ?? 0;
  const boneInfluences = obj.bone_influences?.length ?? 0;
  return { vertexCount, triangleCount, uvChannels, boneInfluences };
}

function getVectorDataCount(data: unknown): number {
  if (!data || typeof data !== "object") return 0;
  const obj = data as Record<string, unknown[]>;
  const key = Object.keys(obj)[0];
  return key ? (obj[key]?.length ?? 0) : 0;
}

function MeshObjectRow({ obj }: { obj: MeshObjectJson }) {
  const stats = getMeshObjectStats(obj);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_48px_72px_72px_48px_48px] items-center border-b border-border/50 px-2 py-1 hover:bg-muted/30">
      <span className="font-mono truncate">{obj.name}</span>
      <span className="text-right">{obj.subindex}</span>
      <span className="text-right">{stats.vertexCount.toLocaleString()}</span>
      <span className="text-right">{stats.triangleCount.toLocaleString()}</span>
      <span className="text-right">{stats.uvChannels}</span>
      <span className="text-right">{stats.boneInfluences ?? "-"}</span>
    </div>
  );
}

function MeshTableHeader() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_48px_72px_72px_48px_48px] border-b px-2 py-1.5 text-xs text-muted-foreground">
      <span className="font-medium">Name</span>
      <span className="text-right font-medium">Sub</span>
      <span className="text-right font-medium">Vertices</span>
      <span className="text-right font-medium">Triangles</span>
      <span className="text-right font-medium">UVs</span>
      <span className="text-right font-medium">Bones</span>
    </div>
  );
}

export function MeshReadonlyTab({ mesh }: MeshReadonlyTabProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const meshData = mesh as MeshDataJson | null;
  const objects = meshData?.objects ?? [];

  const totals = useMemo(
    () =>
      objects.reduce(
        (acc, obj) => {
          const stats = getMeshObjectStats(obj);
          return {
            totalVertices: acc.totalVertices + stats.vertexCount,
            totalTriangles: acc.totalTriangles + stats.triangleCount,
          };
        },
        { totalVertices: 0, totalTriangles: 0 },
      ),
    [objects],
  );

  const getScrollElement = useCallback(() => scrollRef.current, []);
  const rowVirtualizer = useVirtualizer({
    count: objects.length,
    getScrollElement,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  if (!mesh) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        No mesh data (.numshb) available
      </div>
    );
  }

  const useVirtualRows = objects.length > VIRTUALIZE_ROW_THRESHOLD;
  const virtualRows = rowVirtualizer.getVirtualItems();

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-4 text-xs text-muted-foreground border-b pb-2">
        <span>Objects: {objects.length}</span>
        <span>Total Vertices: {totals.totalVertices.toLocaleString()}</span>
        <span>Total Triangles: {totals.totalTriangles.toLocaleString()}</span>
      </div>
      <div ref={scrollRef} className="overflow-auto max-h-[500px] text-xs">
        <MeshTableHeader />
        {useVirtualRows ? (
          <div
            style={{
              height: rowVirtualizer.getTotalSize(),
              width: "100%",
              position: "relative",
            }}
          >
            {virtualRows.map((virtualRow) => {
              const obj = objects[virtualRow.index];
              return (
                <div
                  key={virtualRow.key}
                  className="absolute left-0 top-0 w-full"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <MeshObjectRow obj={obj} />
                </div>
              );
            })}
          </div>
        ) : (
          objects.map((obj, i) => <MeshObjectRow key={i} obj={obj} />)
        )}
      </div>
    </div>
  );
}
