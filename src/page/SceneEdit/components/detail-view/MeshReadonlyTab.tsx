import type { MeshDataJson, MeshObjectJson } from "@/page/TestEditor/components/ssbh-model-preview/types";

type MeshReadonlyTabProps = {
  mesh: unknown | null;
};

function getMeshObjectStats(obj: MeshObjectJson) {
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

export function MeshReadonlyTab({ mesh }: MeshReadonlyTabProps) {
  if (!mesh) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        No mesh data (.numshb) available
      </div>
    );
  }

  const meshData = mesh as MeshDataJson;
  const objects = meshData.objects ?? [];
  const totalVertices = objects.reduce((sum, o) => sum + getMeshObjectStats(o).vertexCount, 0);
  const totalTriangles = objects.reduce((sum, o) => sum + getMeshObjectStats(o).triangleCount, 0);

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-4 text-xs text-muted-foreground border-b pb-2">
        <span>Objects: {objects.length}</span>
        <span>Total Vertices: {totalVertices.toLocaleString()}</span>
        <span>Total Triangles: {totalTriangles.toLocaleString()}</span>
      </div>
      <div className="overflow-auto max-h-[500px]">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-1.5 px-2 font-medium">Name</th>
              <th className="py-1.5 px-2 font-medium text-right">Sub</th>
              <th className="py-1.5 px-2 font-medium text-right">Vertices</th>
              <th className="py-1.5 px-2 font-medium text-right">Triangles</th>
              <th className="py-1.5 px-2 font-medium text-right">UVs</th>
              <th className="py-1.5 px-2 font-medium text-right">Bones</th>
            </tr>
          </thead>
          <tbody>
            {objects.map((obj, i) => {
              const stats = getMeshObjectStats(obj);
              return (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-1 px-2 font-mono truncate max-w-[200px]">{obj.name}</td>
                  <td className="py-1 px-2 text-right">{obj.subindex}</td>
                  <td className="py-1 px-2 text-right">{stats.vertexCount.toLocaleString()}</td>
                  <td className="py-1 px-2 text-right">{stats.triangleCount.toLocaleString()}</td>
                  <td className="py-1 px-2 text-right">{stats.uvChannels}</td>
                  <td className="py-1 px-2 text-right">{stats.boneInfluences}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
