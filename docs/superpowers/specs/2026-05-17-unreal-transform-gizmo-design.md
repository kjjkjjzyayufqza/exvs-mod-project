# Unreal-Style Transform Gizmo — Design Spec

## Summary

Replace the current `SceneTransformControls` wrapper (which delegates to `three-stdlib`'s `TransformControlsImpl`) with a fully custom Unreal Engine-style transform gizmo built as a `THREE.Object3D` subclass.

Goals:
- Unreal Engine visual style: thick arrows, plane handles, rotation rings, scale cubes.
- Full hover highlight (gold) and active state (white + fade others).
- World-space sizing (scales with camera distance like current behavior).
- Backward-compatible props interface — zero changes to `MapViewport.tsx` consumers.

## Architecture

### Core class: `UnrealTransformGizmo extends THREE.Object3D`

```
UnrealTransformGizmo
├── mode: "translate" | "rotate" | "scale"
├── space: "world" | "local"
├── target: THREE.Object3D | null
├── hoveredAxis: AxisId | null
├── activeAxis: AxisId | null
├── _gizmoGroup: THREE.Group          (visual geometry)
├── _pickerGroup: THREE.Group          (invisible hit-detection volumes)
│
├── attach(target) / detach()
├── setMode(mode) / setSpace(space) / setSize(size)
├── updateMatrixWorld()                (sync to target + maintain size)
├── raycast(raycaster, intersects)     (hover detection via picker group)
│
├── onPointerDown(event)
├── onPointerMove(event)
├── onPointerUp(event)
│
└── Events: "change" | "objectChange" | "mouseDown" | "mouseUp" | "dragging-changed"
```

`AxisId` type: `"X" | "Y" | "Z" | "XY" | "XZ" | "YZ" | "XYZ" | "screen"`

### R3F wrapper: `SceneTransformControls`

- Same props interface as the existing component (no breaking changes).
- `useMemo` creates `UnrealTransformGizmo` instance.
- `useEffect` hooks register pointer events on `gl.domElement`.
- `useEffect` syncs props → gizmo state (mode, space, size, showX/Y/Z).
- Renders via `<primitive object={gizmo} />`.
- Listens to gizmo events to call prop callbacks and disable orbit controls.

## Visual Design

### Color system

| Element | Color | Hex |
|---------|-------|-----|
| X axis | Red | `#E44141` |
| Y axis | Green | `#41B841` |
| Z axis | Blue | `#4189E4` |
| Hover highlight | Gold | `#FFCD00` |
| Active (dragging) | White | `#FFFFFF` |
| Center handle | Light gray | `#E0E0E0` |
| Plane handle fill | Per-plane color @ 30% opacity | — |

### Translate mode geometry

| Element | Geometry | Details |
|---------|----------|---------|
| Axis arrow ×3 | CylinderGeometry (shaft r=0.02, h=0.8) + ConeGeometry (r=0.06, h=0.2) | Thick solid arrows, total length ~1.0 |
| Plane handle ×3 | PlaneGeometry (0.2×0.2) | XY/XZ/YZ plane drag, positioned at 1/3 offset between two axes, semi-transparent fill + edge lines |
| Center sphere | SphereGeometry (r=0.08) | Free translation on screen plane |

### Rotate mode geometry

| Element | Geometry | Details |
|---------|----------|---------|
| Rotation ring ×3 | TorusGeometry (R=0.75, r=0.015, segments=64) | Full circle, colored per axis |
| Screen rotation ring | TorusGeometry (R=0.9, r=0.01) | Gray, always faces camera |
| Rotation arc indicator | Dynamic CircleGeometry sector | Gold semi-transparent fan showing rotation delta during drag |

### Scale mode geometry

| Element | Geometry | Details |
|---------|----------|---------|
| Axis line + cube ×3 | CylinderGeometry (shaft) + BoxGeometry (0.08³) | Drag cube endpoint to scale single axis |
| Center cube | BoxGeometry (0.1³) | Uniform scale |
| Plane handle ×3 | Same as translate plane handles | Two-axis scale |

### State transitions

- **Idle:** Each handle shows its axis color.
- **Hover:** Hovered handle material → gold (`#FFCD00`), rest unchanged.
- **Active (dragging):** Active handle → white (`#FFFFFF`), all other handles → opacity 0.3.
- **Release:** Immediate return to idle state.

### Picker meshes (invisible hit zones)

Every visual element has a corresponding larger transparent picker mesh:
- Arrows: thicker cylinder (r=0.06).
- Rings: thicker torus (r=0.04).
- Planes: larger plane (0.3×0.3).
- Picker meshes use a dedicated `THREE.Layers` channel (e.g., layer 1) so the scene camera does not render them, but the gizmo's internal raycaster (set to layer 1) can intersect them. The gizmo overrides `raycast()` to test only against `_pickerGroup` children on that layer.

## Interaction Math

### Translate

1. `pointerdown` → identify `activeAxis` from picker intersect.
2. Compute constraint plane:
   - Single axis (X/Y/Z): choose the plane containing that axis most orthogonal to camera direction.
   - Dual axis (XY/XZ/YZ): use the corresponding world plane.
   - Center (XYZ): camera-facing plane through the gizmo origin.
3. `pointermove` → ray-plane intersection, project delta onto constraint axis/axes.
4. Apply delta to `target.position` (world space) or local space if `space === "local"`.
5. `pointerup` → emit "mouseUp", "dragging-changed {value: false}".

### Rotate

1. `pointerdown` → identify rotation axis.
2. Compute the axis-perpendicular plane; find start angle from gizmo center to ray-plane intersection.
3. `pointermove` → current angle − start angle = delta rotation (radians).
4. Apply incremental quaternion to `target.quaternion`.
5. Update arc sector mesh to show swept angle.
6. `pointerup` → commit, dispose arc mesh.

### Scale

1. `pointerdown` → identify scale axis.
2. Record start projection of ray onto the axis (or plane for dual-axis).
3. `pointermove` → ratio of current projection distance / start distance = scale factor.
4. Single axis: multiply target scale component; center: multiply all three uniformly.
5. `pointerup` → commit.

### OrbitControls interlock

- Emit `"dragging-changed"` event with `{value: boolean}`.
- Wrapper listens and sets `state.controls.enabled = !dragging`.
- Identical pattern to the current implementation.

## File Structure

```
src/page/SceneEdit/components/
├── SceneTransformControls.tsx          (R3F wrapper, interface unchanged)
└── gizmo/
    ├── UnrealTransformGizmo.ts         (Object3D subclass — main entry)
    ├── gizmoGeometry.ts                (geometry builder functions per mode)
    ├── gizmoMaterials.ts               (material factory: normal/hover/active states)
    ├── gizmoInteraction.ts             (drag math: plane projection, axis constraint, angle calc)
    └── gizmoConstants.ts               (colors, sizes, thresholds)
```

## Compatibility

- `SceneTransformControls` props interface is unchanged.
- All existing usage in `MapViewport.tsx` (StageModelGroup, EffectMarker, ImportedDaeGroup) requires zero modification.
- The only dependency removed is `TransformControls` from `three-stdlib` (the import, not the package itself — `OrbitControls` still uses it).

## Out of scope (future iterations)

- Snap-to-grid during drag (covered by roadmap item #5).
- Keyboard modifiers (Shift for axis lock, Ctrl for snap).
- Multi-object transform (pivot center calculation).
- Undo/redo integration with transaction history.
