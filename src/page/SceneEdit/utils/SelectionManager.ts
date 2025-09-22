import * as THREE from 'three';

export interface SelectionChangeCallback {
  (selectedObject: THREE.Object3D | null): void;
}

export class SelectionManager {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private raycaster: THREE.Raycaster;
  private selectedObject: THREE.Object3D | null = null;
  private selectionBox: THREE.BoxHelper | null = null;
  private callbacks: Set<SelectionChangeCallback> = new Set();
  private selectableObjects: THREE.Object3D[] = [];
  private isTransforming: boolean = false;

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    this.scene = scene;
    this.camera = camera;
    this.raycaster = new THREE.Raycaster();
  }

  // 注册可选择的对象
  registerSelectableObject(object: THREE.Object3D) {
    if (!this.selectableObjects.includes(object)) {
      this.selectableObjects.push(object);
    }
  }

  // 取消注册可选择的对象
  unregisterSelectableObject(object: THREE.Object3D) {
    const index = this.selectableObjects.indexOf(object);
    if (index > -1) {
      this.selectableObjects.splice(index, 1);
    }
  }

  // 添加选中状态变化回调
  addSelectionChangeCallback(callback: SelectionChangeCallback) {
    this.callbacks.add(callback);
  }

  // 移除选中状态变化回调
  removeSelectionChangeCallback(callback: SelectionChangeCallback) {
    this.callbacks.delete(callback);
  }

  // 设置变换状态
  setTransforming(transforming: boolean) {
    this.isTransforming = transforming;
  }

  // 处理鼠标点击事件
  handleClick(event: MouseEvent, canvas: HTMLCanvasElement) {
    // 如果正在变换中，忽略点击事件
    if (this.isTransforming) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2();

    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(mouse, this.camera);

    // 只检测注册的可选择对象
    const intersects = this.raycaster.intersectObjects(this.selectableObjects, true);

    if (intersects.length > 0) {
      // 找到最顶层的可选择对象
      let targetObject = intersects[0].object;
      while (targetObject.parent && !this.selectableObjects.includes(targetObject)) {
        targetObject = targetObject.parent;
      }

      if (this.selectableObjects.includes(targetObject)) {
        this.setSelected(targetObject);
      }
    } else {
      this.clearSelection();
    }
  }

  // 设置选中对象
  setSelected(object: THREE.Object3D | null) {
    if (this.selectedObject === object) return;

    // 清除之前的选中状态
    this.clearSelectionVisuals();

    this.selectedObject = object;

    if (object) {
      // 显示选中视觉效果
      this.showSelectionVisuals(object);
    }

    // 通知所有回调
    this.callbacks.forEach(callback => callback(object));
  }

  // 通过ID选中对象
  setSelectedById(objectId: string) {
    const object = this.findObjectById(objectId);
    this.setSelected(object);
  }

  // 清除选中
  clearSelection() {
    this.setSelected(null);
  }

  // 获取当前选中对象
  getSelected(): THREE.Object3D | null {
    return this.selectedObject;
  }

  // 获取当前选中对象的ID
  getSelectedId(): string | null {
    return this.selectedObject?.userData?.modelId || null;
  }

  // 显示选中视觉效果
  private showSelectionVisuals(object: THREE.Object3D) {
    // 创建选中框
    this.selectionBox = new THREE.BoxHelper(object, 0x00ffff);
    this.selectionBox.userData.isSelectionHelper = true;
    this.scene.add(this.selectionBox);

    // 高亮材质
    this.highlightObject(object, true);
  }

  // 清除选中视觉效果
  private clearSelectionVisuals() {
    // 移除选中框
    if (this.selectionBox) {
      this.scene.remove(this.selectionBox);
      this.selectionBox.dispose();
      this.selectionBox = null;
    }

    // 取消高亮
    if (this.selectedObject) {
      this.highlightObject(this.selectedObject, false);
    }
  }

  // 高亮对象
  private highlightObject(object: THREE.Object3D, highlight: boolean) {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(material => {
            if (material instanceof THREE.MeshStandardMaterial) {
              if (highlight) {
                material.emissive.setHex(0x444444);
              } else {
                material.emissive.setHex(0x000000);
              }
            } else if (material instanceof THREE.MeshBasicMaterial) {
              // MeshBasicMaterial 使用 color 属性来实现高亮效果
              if (highlight) {
                material.userData.originalColor = material.color.getHex();
                material.color.setHex(0x888888);
              } else {
                if (material.userData.originalColor !== undefined) {
                  material.color.setHex(material.userData.originalColor);
                }
              }
            }
          });
        } else {
          const material = child.material as THREE.Material;
          if (material instanceof THREE.MeshStandardMaterial) {
            if (highlight) {
              material.emissive.setHex(0x444444);
            } else {
              material.emissive.setHex(0x000000);
            }
          } else if (material instanceof THREE.MeshBasicMaterial) {
            // MeshBasicMaterial 使用 color 属性来实现高亮效果
            if (highlight) {
              material.userData.originalColor = material.color.getHex();
              material.color.setHex(0x888888);
            } else {
              if (material.userData.originalColor !== undefined) {
                material.color.setHex(material.userData.originalColor);
              }
            }
          }
        }
      }
    });
  }

  // 通过ID查找对象
  private findObjectById(objectId: string): THREE.Object3D | null {
    return this.selectableObjects.find(obj => obj.userData?.modelId === objectId) || null;
  }

  // 更新选中框（当对象变换时调用）
  updateSelectionBox() {
    if (this.selectionBox && this.selectedObject) {
      this.selectionBox.setFromObject(this.selectedObject);
    }
  }

  // 清理资源
  dispose() {
    this.clearSelectionVisuals();
    this.callbacks.clear();
    this.selectableObjects.length = 0;
  }
}
