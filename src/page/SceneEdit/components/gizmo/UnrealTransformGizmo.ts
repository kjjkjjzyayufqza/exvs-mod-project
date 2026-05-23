import * as THREE from "three";
import {
  type GizmoMode,
  type GizmoSpace,
  type AxisId,
  PICKER_LAYER,
  GIZMO_RENDER_ORDER,
} from "./gizmoConstants";
import {
  createGizmoMaterials,
  applyHoverState,
  resetAllMaterials,
  disposeGizmoMaterials,
  type GizmoMaterials,
} from "./gizmoMaterials";
import {
  buildTranslateGeometry,
  buildRotateGeometry,
  buildScaleGeometry,
  createRotationArcMesh,
  disposeGeometry,
  type ModeGeometry,
} from "./gizmoGeometry";
import {
  beginDrag,
  applyTranslateDrag,
  applyRotateDrag,
  applyScaleDrag,
  type DragState,
} from "./gizmoInteraction";

type GizmoEventMap = {
  change: {};
  objectChange: {};
  mouseDown: {};
  mouseUp: {};
  "dragging-changed": { value: boolean };
};

const GIZMO_SCREEN_FRACTION = 0.12;
const GIZMO_BASE_EXTENT = 100;

const _raycaster = new THREE.Raycaster();
const _pointer = new THREE.Vector2();
const _worldPos = new THREE.Vector3();
const _camDir = new THREE.Vector3();

export class UnrealTransformGizmo extends THREE.Object3D {
  readonly isTransformControls = true;

  private _mode: GizmoMode = "translate";
  private _space: GizmoSpace = "world";
  private _size = 1;
  private _showX = true;
  private _showY = true;
  private _showZ = true;

  private _target: THREE.Object3D | null = null;
  private _camera: THREE.Camera;
  private _domElement: HTMLElement;

  private _hoveredAxis: AxisId | null = null;
  private _activeAxis: AxisId | null = null;
  private _dragging = false;
  private _dragState: DragState | null = null;

  private _materials: GizmoMaterials;
  private _gizmoGroup = new THREE.Group();
  private _pickerGroup = new THREE.Group();
  private _currentGeometry: ModeGeometry | null = null;
  private _arcMesh: THREE.Mesh | null = null;

  private _pickerRaycaster = new THREE.Raycaster();
  private _listeners: Record<string, Array<(event: any) => void>> = {};

  constructor(camera: THREE.Camera, domElement: HTMLElement) {
    super();
    this.name = "UnrealTransformGizmo";
    this._camera = camera;
    this._domElement = domElement;
    this._materials = createGizmoMaterials();

    this.renderOrder = GIZMO_RENDER_ORDER;
    this.frustumCulled = false;

    this._pickerRaycaster.layers.set(PICKER_LAYER);

    this.add(this._gizmoGroup);
    this.add(this._pickerGroup);

    this._gizmoGroup.renderOrder = GIZMO_RENDER_ORDER;
    this._pickerGroup.renderOrder = GIZMO_RENDER_ORDER + 1;

    this._buildMode();

    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);

    domElement.addEventListener("pointermove", this._onPointerMove);
    domElement.addEventListener("pointerdown", this._onPointerDown);
    domElement.addEventListener("pointerup", this._onPointerUp);
  }

  get mode(): GizmoMode {
    return this._mode;
  }
  get space(): GizmoSpace {
    return this._space;
  }
  get dragging(): boolean {
    return this._dragging;
  }
  get object(): THREE.Object3D | null {
    return this._target;
  }

  setMode(mode: GizmoMode): void {
    if (this._mode === mode) return;
    this._mode = mode;
    this._buildMode();
  }

  setSpace(space: GizmoSpace): void {
    this._space = space;
  }

  setSize(size: number): void {
    this._size = size;
  }

  attach(target: THREE.Object3D): this {
    this._target = target;
    this.visible = true;
    return this;
  }

  detach(): this {
    this._target = null;
    this.visible = false;
    return this;
  }

  override updateMatrixWorld(force?: boolean): void {
    if (this._target) {
      this._target.updateWorldMatrix(true, false);
      this._target.getWorldPosition(_worldPos);
      this.position.copy(_worldPos);

      if (this._space === "local") {
        this._target.getWorldQuaternion(this.quaternion);
      } else {
        this.quaternion.identity();
      }

      const distance = this._camera.position.distanceTo(_worldPos);
      let scaleFactor: number;
      if (this._camera instanceof THREE.PerspectiveCamera) {
        const halfFov = (this._camera.fov * Math.PI / 180) / 2;
        const viewportHalfHeight = distance * Math.tan(halfFov);
        scaleFactor = (viewportHalfHeight * GIZMO_SCREEN_FRACTION / GIZMO_BASE_EXTENT) * this._size;
      } else {
        scaleFactor = distance * 0.001 * this._size;
      }
      this.scale.setScalar(scaleFactor);
    }

    super.updateMatrixWorld(force);
    this._updateAxisVisibility();
  }

  override addEventListener(type: string, listener: (event: any) => void): void {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(listener);
  }

  override removeEventListener(type: string, listener: (event: any) => void): void {
    const arr = this._listeners[type];
    if (!arr) return;
    const idx = arr.indexOf(listener);
    if (idx !== -1) arr.splice(idx, 1);
  }

  private _emit<K extends keyof GizmoEventMap>(type: K, detail?: GizmoEventMap[K]): void {
    const arr = this._listeners[type as string];
    if (!arr) return;
    const event = { type, ...detail };
    for (const fn of arr) fn(event);
  }

  dispose(): void {
    this._domElement.removeEventListener("pointermove", this._onPointerMove);
    this._domElement.removeEventListener("pointerdown", this._onPointerDown);
    this._domElement.removeEventListener("pointerup", this._onPointerUp);

    if (this._currentGeometry) {
      disposeGeometry(this._currentGeometry);
    }
    disposeGizmoMaterials(this._materials);
    this._removeArcMesh();
  }

  private _buildMode(): void {
    if (this._currentGeometry) {
      disposeGeometry(this._currentGeometry);
    }
    this._gizmoGroup.clear();
    this._pickerGroup.clear();

    let geo: ModeGeometry;
    switch (this._mode) {
      case "translate":
        geo = buildTranslateGeometry(this._materials);
        break;
      case "rotate":
        geo = buildRotateGeometry(this._materials);
        break;
      case "scale":
        geo = buildScaleGeometry(this._materials);
        break;
    }

    this._currentGeometry = geo;
    for (const el of geo.elements) {
      el.visual.traverse((child) => {
        child.renderOrder = GIZMO_RENDER_ORDER;
      });
      el.picker.renderOrder = GIZMO_RENDER_ORDER + 1;
      this._gizmoGroup.add(el.visual);
      this._pickerGroup.add(el.picker);
    }
  }

  private _updateAxisVisibility(): void {
    if (!this._currentGeometry) return;
    for (const el of this._currentGeometry.elements) {
      const { axisId } = el;
      let visible = true;
      if (axisId === "X" || axisId === "XZ" || axisId === "XY") {
        if (!this._showX && (axisId === "X")) visible = false;
      }
      if (axisId === "Y" || axisId === "XY" || axisId === "YZ") {
        if (!this._showY && (axisId === "Y")) visible = false;
      }
      if (axisId === "Z" || axisId === "XZ" || axisId === "YZ") {
        if (!this._showZ && (axisId === "Z")) visible = false;
      }
      el.visual.visible = visible;
      el.picker.visible = visible;
    }
  }

  set showX(v: boolean) {
    this._showX = v;
  }
  set showY(v: boolean) {
    this._showY = v;
  }
  set showZ(v: boolean) {
    this._showZ = v;
  }

  private _getPointerNDC(event: PointerEvent): THREE.Vector2 {
    const rect = this._domElement.getBoundingClientRect();
    _pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    _pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    return _pointer;
  }

  private _intersectPickers(event: PointerEvent): AxisId | null {
    if (!this._currentGeometry || !this.visible) return null;

    this.updateMatrixWorld();

    const ndc = this._getPointerNDC(event);
    this._pickerRaycaster.setFromCamera(ndc, this._camera);

    const pickers = this._currentGeometry.elements
      .filter((el) => el.picker.visible)
      .map((el) => el.picker);

    const allChildren: THREE.Object3D[] = [];
    for (const p of pickers) {
      p.traverse((c) => {
        if (c instanceof THREE.Mesh) allChildren.push(c);
      });
    }

    const intersects = this._pickerRaycaster.intersectObjects(allChildren, false);
    if (intersects.length === 0) return null;

    const hitObj = intersects[0].object;
    for (const el of this._currentGeometry.elements) {
      let found = false;
      el.picker.traverse((c) => {
        if (c === hitObj) found = true;
      });
      if (found) return el.axisId;
    }
    return null;
  }

  private _onPointerMove(event: PointerEvent): void {
    if (this._dragging) {
      this._handleDrag(event);
      return;
    }

    const axis = this._intersectPickers(event);
    if (axis !== this._hoveredAxis) {
      this._hoveredAxis = axis;
      applyHoverState(this._materials, this._hoveredAxis, this._activeAxis);
      this._emit("change");
    }
  }

  private _onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    if (!this._target) return;

    const axis = this._intersectPickers(event);
    if (!axis) return;

    event.stopPropagation();
    (this._domElement as HTMLElement).setPointerCapture(event.pointerId);

    this._activeAxis = axis;
    this._dragging = true;

    const ndc = this._getPointerNDC(event);
    _raycaster.setFromCamera(ndc, this._camera);

    this._camera.getWorldDirection(_camDir);
    this.getWorldPosition(_worldPos);

    this._dragState = beginDrag(
      axis,
      _raycaster,
      _worldPos,
      _camDir,
      this._target,
      this._space,
      this._mode,
    );

    applyHoverState(this._materials, this._hoveredAxis, this._activeAxis);
    this._emit("mouseDown");
    this._emit("dragging-changed", { value: true });
    this._emit("change");
  }

  private _onPointerUp(event: PointerEvent): void {
    if (!this._dragging) return;

    (this._domElement as HTMLElement).releasePointerCapture(event.pointerId);

    this._dragging = false;
    this._activeAxis = null;
    this._dragState = null;

    this._removeArcMesh();
    resetAllMaterials(this._materials);

    this._emit("mouseUp");
    this._emit("dragging-changed", { value: false });
    this._emit("change");
  }

  private _handleDrag(event: PointerEvent): void {
    if (!this._dragState || !this._target) return;

    const ndc = this._getPointerNDC(event);
    _raycaster.setFromCamera(ndc, this._camera);

    this.getWorldPosition(_worldPos);

    let applied = false;

    switch (this._mode) {
      case "translate":
        applied = applyTranslateDrag(this._dragState, _raycaster, this._target, this._space);
        break;
      case "rotate": {
        const result = applyRotateDrag(
          this._dragState,
          _raycaster,
          this._target,
          _worldPos,
          this._space,
        );
        applied = result.applied;
        if (applied) {
          this._updateArcMesh(result.sweepAngle);
        }
        break;
      }
      case "scale":
        applied = applyScaleDrag(this._dragState, _raycaster, this._target, _worldPos, this._space);
        break;
    }

    if (applied) {
      this._emit("objectChange");
      this._emit("change");
    }
  }

  private _updateArcMesh(sweepAngle: number): void {
    this._removeArcMesh();
    if (Math.abs(sweepAngle) < 0.001) return;
    if (!this.parent) return;

    const normal = this._dragState!.constraintPlane.normal;
    this._arcMesh = createRotationArcMesh(
      normal,
      this._dragState!.startAngle,
      sweepAngle,
      70 * this._size,
    );

    this.getWorldPosition(_worldPos);
    this._arcMesh.position.copy(_worldPos);
    this.parent.add(this._arcMesh);
  }

  private _removeArcMesh(): void {
    if (this._arcMesh) {
      this._arcMesh.removeFromParent();
      this._arcMesh.geometry.dispose();
      (this._arcMesh.material as THREE.Material).dispose();
      this._arcMesh = null;
    }
  }
}
