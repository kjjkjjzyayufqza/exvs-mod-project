import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Html, Line } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

import { SceneTransformControls } from "../SceneTransformControls";

import type { MissionSpawnMarker } from "@/services/missionPreview/missionPreviewService";
import { frontMissionSpawnSlot, tagMissionSpawn } from "./missionSpawnPick";
import {
  MISSION_SELECTION_COLOR,
  missionMarkerColor,
  missionPhaseKey,
} from "./missionPreviewTheme";

/**
 * Spawn gizmos drawn on top of the loaded map.
 *
 * Shaped after the actor gizmos an engine viewport draws rather than after a
 * plain debug marker: every slot gets a ground footprint directly under it, a
 * dashed altitude line up to the spawn point, a facing wedge on the spawn
 * plane, and a body that is depth-tested so it sits *in* the map, plus a thin
 * always-visible silhouette so it is never completely lost behind geometry.
 */

/** Proportions are all relative to one marker scale unit. */
const BODY_HEIGHT = 1.2;
const BODY_RADIUS = 0.24;
const RING_INNER = 0.62;
const RING_OUTER = 0.8;
const FOOTPRINT_OUTER = 0.95;
/** Half-angle of the facing wedge, matching a readable view cone. */
const FACING_HALF_ANGLE = Math.PI / 7;

interface MissionSpawnMarkersProps {
  markers: readonly MissionSpawnMarker[];
  /** World size of one marker; spawn coordinates are raw map world units. */
  markerScale: number;
  /** Phase keys to draw. `null` draws every phase. */
  visiblePhaseKeys: ReadonlySet<string> | null;
  selectedSlot: number | null;
  onSelectSlot: (slot: number | null) => void;
  showLabels: boolean;
  labelOf: (marker: MissionSpawnMarker) => string;
  /** When set, the selected marker can be dragged. External-coordinate slots stay fixed. */
  gizmoMode?: "translate" | "rotate" | "scale";
  gizmoSize?: number;
  canDragSlot?: (slot: number) => boolean;
  onSpawnCommit?: (slot: number, transform: { x: number; y: number; z: number; facing: number }) => void;
  gizmoDraggingRef?: RefObject<boolean>;
  /** Drop the scene-node selection when a spawn marker wins the pointer. */
  onClaimSceneSelection?: () => void;
}

/** Filled wedge on the XZ plane opening along +Z, used as the facing cue. */
function useFacingWedgeGeometry(radius: number): THREE.ShapeGeometry {
  return useMemo(() => {
    // The shape is authored in its own XY plane and then laid onto the ground
    // with `rotation={[-PI/2, 0, 0]}`, which maps shape +Y to world -Z. The
    // arc is therefore centred on shape -Y so the wedge opens along world +Z,
    // matching `missionFacingForward` at a facing of 0.
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.absarc(
      0,
      0,
      radius,
      -Math.PI / 2 - FACING_HALF_ANGLE,
      -Math.PI / 2 + FACING_HALF_ANGLE,
      false,
    );
    shape.lineTo(0, 0);
    return new THREE.ShapeGeometry(shape, 16);
  }, [radius]);
}

interface MissionSpawnMarkerMeshProps {
  marker: MissionSpawnMarker;
  markerScale: number;
  color: string;
  selected: boolean;
  onSelect: (slot: number | null) => void;
  showLabel: boolean;
  label: string;
  showGizmo: boolean;
  gizmoMode: "translate" | "rotate" | "scale";
  gizmoSize: number;
  onSpawnCommit?: (slot: number, transform: { x: number; y: number; z: number; facing: number }) => void;
  gizmoDraggingRef?: RefObject<boolean>;
  onClaimSceneSelection?: () => void;
}

function MissionSpawnMarkerMesh({
  marker,
  markerScale,
  color,
  selected,
  onSelect,
  showLabel,
  label,
  showGizmo,
  gizmoMode,
  gizmoSize,
  onSpawnCommit,
  gizmoDraggingRef,
  onClaimSceneSelection,
}: MissionSpawnMarkerMeshProps) {
  const groupRef = useRef<THREE.Group>(null);
  const slotRef = useRef(marker.slot);
  const selectedRef = useRef(selected);
  slotRef.current = marker.slot;
  selectedRef.current = selected;
  const [gizmoObject, setGizmoObject] = useState<THREE.Group | null>(null);
  const [hovered, setHovered] = useState(false);
  const assignGroup = useCallback((node: THREE.Group | null) => {
    if (node) tagMissionSpawn(node, slotRef.current, selectedRef.current);
    groupRef.current = node;
    setGizmoObject(node);
  }, []);
  useLayoutEffect(() => {
    const group = groupRef.current;
    if (group) tagMissionSpawn(group, marker.slot, selected);
  }, [marker.slot, selected]);
  const claimPointer = useCallback((event: ThreeEvent<PointerEvent>) => {
    const winner = frontMissionSpawnSlot(event.intersections);
    if (winner !== marker.slot) return;
    event.stopPropagation();
    onSelect(marker.slot);
    onClaimSceneSelection?.();
  }, [marker.slot, onClaimSceneSelection, onSelect]);
  const claimHover = useCallback((event: ThreeEvent<PointerEvent>) => {
    if (frontMissionSpawnSlot(event.intersections) !== marker.slot) return;
    event.stopPropagation();
    setHovered(true);
  }, [marker.slot]);
  const releaseHover = useCallback(() => setHovered(false), []);
  const pickProps = {
    onPointerDown: claimPointer,
    onClick: claimPointer,
  };
  const controlMode = gizmoMode === "rotate" ? "rotate" : "translate";
  const commitDrag = useCallback(() => {
    const group = groupRef.current;
    if (!group || !onSpawnCommit) return;
    onSpawnCommit(marker.slot, {
      x: group.position.x,
      y: group.position.y,
      z: group.position.z,
      facing: THREE.MathUtils.radToDeg(group.rotation.y),
    });
  }, [marker.slot, onSpawnCommit]);
  // Yaw convention lives in `missionFacingForward`: 0 looks down +Z, 180 down
  // -Z. Every directional part of this gizmo is authored along +Z so that this
  // rotation alone orients it.
  const yaw = useMemo(
    () => THREE.MathUtils.degToRad(marker.facingDegrees),
    [marker.facingDegrees],
  );

  const bodyHeight = markerScale * BODY_HEIGHT;
  const spawnHeight = marker.position[1];
  const outlineColor = selected ? MISSION_SELECTION_COLOR : color;

  const wedge = useFacingWedgeGeometry(markerScale * 1.9);
  const altitudeLine = useMemo<[number, number, number][]>(
    () => [
      [0, 0, 0],
      [0, -spawnHeight, 0],
    ],
    [spawnHeight],
  );

  return (
    <>
    <group ref={assignGroup} position={marker.position} rotation={[0, yaw, 0]}>
      {/* Ground footprint: where the slot actually lands on the map. */}
      <group position={[0, -spawnHeight, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={2} {...pickProps}>
          <ringGeometry args={[markerScale * 0.08, markerScale * FOOTPRINT_OUTER, 40]} />
          <meshBasicMaterial
            color={color}
            side={THREE.DoubleSide}
            transparent
            opacity={selected ? 0.22 : 0.12}
            depthWrite={false}
          />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
          <ringGeometry
            args={[markerScale * (FOOTPRINT_OUTER - 0.04), markerScale * FOOTPRINT_OUTER, 40]}
          />
          <meshBasicMaterial
            color={outlineColor}
            side={THREE.DoubleSide}
            transparent
            opacity={selected ? 0.95 : 0.55}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* Altitude line: reads the spawn height against the ground footprint. */}
      {Math.abs(spawnHeight) > 1e-3 && (
        <Line
          points={altitudeLine}
          color={outlineColor}
          lineWidth={selected ? 1.6 : 1}
          dashed
          dashSize={markerScale * 0.35}
          gapSize={markerScale * 0.3}
          transparent
          opacity={selected ? 0.8 : 0.4}
          depthWrite={false}
          renderOrder={3}
          onPointerDown={claimPointer}
          onClick={claimPointer}
        />
      )}

      {/* Facing wedge on the spawn plane: which way the slot is pointed. */}
      <mesh geometry={wedge} rotation={[-Math.PI / 2, 0, 0]} renderOrder={4} {...pickProps}>
        <meshBasicMaterial
          color={color}
          side={THREE.DoubleSide}
          transparent
          opacity={selected ? 0.3 : 0.16}
          depthWrite={false}
        />
      </mesh>

      {/* Spawn-plane ring at the spawn point itself. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={5} {...pickProps}>
        <ringGeometry args={[markerScale * RING_INNER, markerScale * RING_OUTER, 40]} />
        <meshBasicMaterial
          color={outlineColor}
          side={THREE.DoubleSide}
          transparent
          opacity={selected ? 1 : 0.75}
          depthWrite={false}
        />
      </mesh>

      {/* Body, depth-tested so it sits inside the map like an actor would. */}
      <mesh
        position={[0, bodyHeight / 2, 0]}
        {...pickProps}
        onPointerOver={claimHover}
        onPointerOut={releaseHover}
      >
        <capsuleGeometry args={[markerScale * BODY_RADIUS, bodyHeight * 0.62, 4, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={selected ? 0.55 : hovered ? 0.4 : 0.25}
          roughness={0.35}
          metalness={0.1}
          transparent
          opacity={0.92}
        />
      </mesh>

      {/* Silhouette: thin, always on top, so an occluded slot stays findable. */}
      <mesh position={[0, bodyHeight / 2, 0]} renderOrder={6} {...pickProps}>
        <capsuleGeometry
          args={[markerScale * (BODY_RADIUS + 0.05), bodyHeight * 0.62, 4, 16]}
        />
        <meshBasicMaterial
          color={outlineColor}
          side={THREE.BackSide}
          transparent
          opacity={selected ? 0.55 : 0.2}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>

      {showLabel && (
        <Html
          position={[0, bodyHeight + markerScale * 0.45, 0]}
          center
          zIndexRange={[20, 0]}
          style={{ pointerEvents: "none" }}
        >
          <div
            className="flex select-none items-center gap-1.5 whitespace-nowrap rounded-[3px] border px-1.5 py-[3px] font-mono text-[10px] leading-none tabular-nums backdrop-blur-[2px]"
            style={{
              borderColor: selected ? MISSION_SELECTION_COLOR : `${color}99`,
              background: "rgba(14, 15, 18, 0.82)",
              color: "rgba(244, 245, 247, 0.95)",
              boxShadow: selected
                ? `0 0 0 1px ${MISSION_SELECTION_COLOR}55, 0 2px 10px rgba(0,0,0,0.55)`
                : "0 2px 8px rgba(0,0,0,0.45)",
            }}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-[1px]"
              style={{ backgroundColor: color }}
            />
            {label}
          </div>
        </Html>
      )}
    </group>
    {showGizmo && gizmoObject && onSpawnCommit ? (
      <SceneTransformControls
        key={`mission-spawn-${marker.slot}-${controlMode}`}
        object={gizmoObject}
        mode={controlMode}
        space="world"
        size={gizmoSize}
        showX={controlMode !== "rotate"}
        showY
        showZ={controlMode !== "rotate"}
        onMouseDown={() => {
          if (gizmoDraggingRef) gizmoDraggingRef.current = true;
        }}
        onMouseUp={() => {
          if (gizmoDraggingRef) setTimeout(() => { gizmoDraggingRef.current = false; }, 50);
          commitDrag();
        }}
      />
    ) : null}
    </>
  );
}

export const MissionSpawnMarkers = memo(function MissionSpawnMarkers({
  markers,
  markerScale,
  visiblePhaseKeys,
  selectedSlot,
  onSelectSlot,
  showLabels,
  labelOf,
  gizmoMode = "translate",
  gizmoSize = 1,
  canDragSlot,
  onSpawnCommit,
  gizmoDraggingRef,
  onClaimSceneSelection,
}: MissionSpawnMarkersProps) {
  const visible = useMemo(
    () =>
      visiblePhaseKeys == null
        ? markers
        : markers.filter((marker) => visiblePhaseKeys.has(missionPhaseKey(marker.phase))),
    [markers, visiblePhaseKeys],
  );

  return (
    <group name="mission-spawn-markers">
      {visible.map((marker) => (
        <MissionSpawnMarkerMesh
          key={marker.key}
          marker={marker}
          markerScale={markerScale}
          color={missionMarkerColor(marker)}
          selected={selectedSlot === marker.slot}
          onSelect={onSelectSlot}
          showLabel={showLabels}
          label={labelOf(marker)}
          showGizmo={!!onSpawnCommit && selectedSlot === marker.slot && (canDragSlot?.(marker.slot) ?? true)}
          gizmoMode={gizmoMode}
          gizmoSize={gizmoSize}
          onSpawnCommit={onSpawnCommit}
          gizmoDraggingRef={gizmoDraggingRef}
          onClaimSceneSelection={onClaimSceneSelection}
        />
      ))}
    </group>
  );
});
