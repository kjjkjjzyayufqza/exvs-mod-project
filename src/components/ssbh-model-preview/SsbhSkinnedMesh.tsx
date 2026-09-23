import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { Matrix4, type Mesh, type Skeleton, SkinnedMesh } from "three";
import type { ExvsObjectParams } from "@/components/exvs-renderer";
import type { BuiltMeshDraw } from "./types";

type SsbhSkinnedMeshProps = {
  draw: BuiltMeshDraw;
  skeleton: Skeleton;
  ignoreRaycast: boolean;
  /** Read off userData by the EXVS2 pipeline; ignored by the other render styles. */
  exvsParams?: ExvsObjectParams;
  children: ReactNode;
};

const noopMeshRaycast: Mesh["raycast"] = () => {};

export function SsbhSkinnedMesh({
  draw,
  skeleton,
  ignoreRaycast,
  exvsParams,
  children,
}: SsbhSkinnedMeshProps) {
  const bindMatrix = useMemo(() => new Matrix4(), [draw.key]);
  const skinnedRef = useRef<SkinnedMesh>(null);

  useLayoutEffect(() => {
    const mesh = skinnedRef.current;
    if (!mesh) {
      return;
    }
    mesh.bindMode = "detached";
    mesh.bind(skeleton, bindMatrix);
  }, [skeleton, bindMatrix]);

  return (
    <skinnedMesh
      ref={skinnedRef}
      geometry={draw.geometry}
      raycast={ignoreRaycast ? noopMeshRaycast : undefined}
      frustumCulled={false}
      userData={exvsParams ? { exvs: exvsParams } : undefined}
    >
      {children}
    </skinnedMesh>
  );
}

