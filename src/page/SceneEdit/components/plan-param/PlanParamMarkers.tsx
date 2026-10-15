import { memo, useCallback, useMemo, useRef, useState, type RefObject } from "react";
import { Html, Line } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useTranslation } from "react-i18next";
import * as THREE from "three";

import type { PlanPointKind, PlanPointView } from "../../types/planParam";
import { limitRingPoints, spawnPairLines } from "../../utils/planParamEdit";
import { SceneTransformControls } from "../SceneTransformControls";

/** World size of one spawn marker. Stage coordinates are hundreds of units. */
const MARKER_SCALE = 20;

export const PLAN_LIMIT_KEY = "limit";

export const PLAN_POINT_COLORS: Record<PlanPointKind, string> = {
  spawnFirst: "#35d0ff",
  spawnSecond: "#ff5ad1",
  marker: "#ffb020",
  respawn: "#7dff6a",
};

const LIMIT_COLOR = "#d7dde8";

interface PlanParamMarkersProps {
  points: readonly PlanPointView[];
  limit: number;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onMove: (key: string, position: [number, number, number]) => void;
  onLimitChange: (limit: number) => void;
  onMarkerParameter: (key: string, parameter: number) => void;
  gizmoMode?: "translate" | "rotate" | "scale";
  gizmoSize: number;
  gizmoDraggingRef?: RefObject<boolean>;
  onClaimSceneSelection?: () => void;
}

function PlanPointMesh({
  point,
  selected,
  gizmoMode,
  onSelect,
  onMove,
  onMarkerParameter,
  gizmoSize,
  gizmoDraggingRef,
  onClaimSceneSelection,
}: {
  point: PlanPointView;
  selected: boolean;
  gizmoMode: "translate" | "rotate" | "scale";
  onSelect: (key: string) => void;
  onMove: (key: string, position: [number, number, number]) => void;
  onMarkerParameter: (key: string, parameter: number) => void;
  gizmoSize: number;
  gizmoDraggingRef?: RefObject<boolean>;
  onClaimSceneSelection?: () => void;
}) {
  const { t } = useTranslation("scene-page");
  const groupRef = useRef<THREE.Group>(null);
  const [gizmoObject, setGizmoObject] = useState<THREE.Group | null>(null);
  const assignGroup = useCallback((node: THREE.Group | null) => {
    groupRef.current = node;
    setGizmoObject(node);
  }, []);
  const color = PLAN_POINT_COLORS[point.id.kind];
  const rotateMarker = selected && gizmoMode === "rotate" && point.id.kind === "marker";
  const claim = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      onSelect(point.key);
      onClaimSceneSelection?.();
    },
    [onClaimSceneSelection, onSelect, point.key],
  );
  const commit = useCallback(() => {
    const group = groupRef.current;
    if (!group) return;
    if (rotateMarker) {
      onMarkerParameter(point.key, group.rotation.y);
      return;
    }
    onMove(point.key, [group.position.x, group.position.y, group.position.z]);
  }, [onMarkerParameter, onMove, point.key, rotateMarker]);
  const dropLine = useMemo<[number, number, number][]>(
    () => [
      [0, 0, 0],
      [0, -point.position[1], 0],
    ],
    [point.position],
  );
  const label = t(`planParam.markerLabel.${point.id.kind}`, { index: point.id.index + 1 });

  return (
    <>
      <group
        ref={assignGroup}
        position={point.position}
        rotation={point.id.kind === "marker" ? [0, point.trailing, 0] : undefined}
      >
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={4} onPointerDown={claim} onClick={claim}>
          <ringGeometry args={[MARKER_SCALE * 0.55, MARKER_SCALE * 0.85, 28]} />
          <meshBasicMaterial
            color={selected ? "#ffffff" : color}
            side={THREE.DoubleSide}
            transparent
            opacity={selected ? 0.95 : 0.7}
            depthWrite={false}
          />
        </mesh>
        {Math.abs(point.position[1]) > 0.5 && (
          <Line
            points={dropLine}
            color={color}
            dashed
            dashSize={MARKER_SCALE * 0.45}
            gapSize={MARKER_SCALE * 0.3}
            transparent
            opacity={0.55}
            depthWrite={false}
            onPointerDown={claim}
            onClick={claim}
          />
        )}
        {point.id.kind === "marker" && (
          <mesh position={[0, MARKER_SCALE * 0.15, MARKER_SCALE * 0.9]} rotation={[Math.PI / 2, 0, 0]} onPointerDown={claim} onClick={claim}>
            <coneGeometry args={[MARKER_SCALE * 0.18, MARKER_SCALE * 0.7, 8]} />
            <meshBasicMaterial color={color} depthTest={false} depthWrite={false} />
          </mesh>
        )}
        <mesh position={[0, MARKER_SCALE * 0.9, 0]} onPointerDown={claim} onClick={claim}>
          <sphereGeometry args={[MARKER_SCALE * 0.42, 16, 12]} />
          <meshBasicMaterial
            color={selected ? "#ffffff" : color}
            transparent
            opacity={0.95}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
        <Html position={[0, MARKER_SCALE * 1.8, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
          <div
            className="select-none whitespace-nowrap rounded-[3px] border px-1.5 py-0.75 font-mono text-[10px] leading-none"
            style={{
              borderColor: selected ? "#ffffff" : color,
              background: "rgba(14, 15, 18, 0.82)",
              color: "rgba(244, 245, 247, 0.95)",
            }}
          >
            {label}
          </div>
        </Html>
      </group>
      {selected && gizmoObject ? (
        <SceneTransformControls
          key={`${point.key}-${rotateMarker ? "rotate" : "translate"}`}
          object={gizmoObject}
          mode={rotateMarker ? "rotate" : "translate"}
          space="world"
          size={gizmoSize}
          showX={!rotateMarker}
          showY
          showZ={!rotateMarker}
          onMouseDown={() => {
            if (gizmoDraggingRef) gizmoDraggingRef.current = true;
          }}
          onMouseUp={() => {
            if (gizmoDraggingRef) {
              setTimeout(() => {
                gizmoDraggingRef.current = false;
              }, 50);
            }
            commit();
          }}
        />
      ) : null}
    </>
  );
}

function LimitHandle({
  limit,
  selected,
  onSelect,
  onLimitChange,
  gizmoSize,
  gizmoDraggingRef,
  onClaimSceneSelection,
}: {
  limit: number;
  selected: boolean;
  onSelect: (key: string) => void;
  onLimitChange: (limit: number) => void;
  gizmoSize: number;
  gizmoDraggingRef?: RefObject<boolean>;
  onClaimSceneSelection?: () => void;
}) {
  const { t } = useTranslation("scene-page");
  const groupRef = useRef<THREE.Group>(null);
  const [gizmoObject, setGizmoObject] = useState<THREE.Group | null>(null);
  const assignGroup = useCallback((node: THREE.Group | null) => {
    groupRef.current = node;
    setGizmoObject(node);
  }, []);
  const ring = useMemo(() => limitRingPoints(limit), [limit]);
  const claim = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      onSelect(PLAN_LIMIT_KEY);
      onClaimSceneSelection?.();
    },
    [onClaimSceneSelection, onSelect],
  );
  const commit = useCallback(() => {
    const group = groupRef.current;
    if (!group) return;
    onLimitChange(Math.abs(group.position.x));
  }, [onLimitChange]);

  if (ring.length === 0) return null;

  return (
    <>
      <Line points={ring} color={LIMIT_COLOR} transparent opacity={0.8} depthWrite={false} />
      <group ref={assignGroup} position={[Math.abs(limit), 0, 0]}>
        <mesh onPointerDown={claim} onClick={claim}>
          <sphereGeometry args={[MARKER_SCALE * 0.55, 16, 12]} />
          <meshBasicMaterial color={selected ? "#ffffff" : LIMIT_COLOR} depthTest={false} depthWrite={false} />
        </mesh>
        <Html position={[0, MARKER_SCALE * 1.4, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
          <div className="select-none rounded-[3px] border border-white/40 bg-black/80 px-1.5 py-0.75 font-mono text-[10px] text-white">
            {t("planParam.limitHandle", { value: Math.abs(limit) })}
          </div>
        </Html>
      </group>
      {selected && gizmoObject ? (
        <SceneTransformControls
          object={gizmoObject}
          mode="translate"
          space="world"
          size={gizmoSize}
          showY={false}
          onMouseDown={() => {
            if (gizmoDraggingRef) gizmoDraggingRef.current = true;
          }}
          onMouseUp={() => {
            if (gizmoDraggingRef) {
              setTimeout(() => {
                gizmoDraggingRef.current = false;
              }, 50);
            }
            commit();
          }}
        />
      ) : null}
    </>
  );
}

export const PlanParamMarkers = memo(function PlanParamMarkers({
  points,
  limit,
  selectedKey,
  onSelect,
  onMove,
  onLimitChange,
  onMarkerParameter,
  gizmoMode = "translate",
  gizmoSize,
  gizmoDraggingRef,
  onClaimSceneSelection,
}: PlanParamMarkersProps) {
  const pairs = useMemo(() => spawnPairLines(points), [points]);
  return (
    <group name="plan-param-markers">
      {pairs.map(([start, end], index) => (
        <Line
          key={`pair-${index}`}
          points={[start, end]}
          color={PLAN_POINT_COLORS.spawnFirst}
          transparent
          opacity={0.85}
          depthWrite={false}
        />
      ))}
      <LimitHandle
        limit={limit}
        selected={selectedKey === PLAN_LIMIT_KEY}
        onSelect={onSelect}
        onLimitChange={onLimitChange}
        gizmoSize={gizmoSize}
        gizmoDraggingRef={gizmoDraggingRef}
        onClaimSceneSelection={onClaimSceneSelection}
      />
      {points.map((point) => (
        <PlanPointMesh
          key={point.key}
          point={point}
          selected={selectedKey === point.key}
          gizmoMode={gizmoMode}
          onSelect={onSelect}
          onMove={onMove}
          onMarkerParameter={onMarkerParameter}
          gizmoSize={gizmoSize}
          gizmoDraggingRef={gizmoDraggingRef}
          onClaimSceneSelection={onClaimSceneSelection}
        />
      ))}
    </group>
  );
});
