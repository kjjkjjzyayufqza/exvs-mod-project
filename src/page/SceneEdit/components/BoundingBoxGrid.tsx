import { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';

interface BoundingBoxGridProps {
    target: THREE.Object3D | null;
    visible?: boolean;
    color?: string;
}

export function BoundingBoxGrid({ target, visible = true, color = '#00ff00' }: BoundingBoxGridProps) {
    const lineRef = useRef<THREE.LineSegments>(null);
    
    // Calculate bounding box and create grid geometry
    const gridGeometry = useMemo(() => {
        if (!target) return null;

        // Calculate bounding box
        const box = new THREE.Box3();
        box.setFromObject(target);
        
        if (box.isEmpty()) return null;

        const min = box.min;
        const max = box.max;

        // Create vertices for the wireframe box
        const vertices = new Float32Array([
            // Bottom face
            min.x, min.y, min.z,  max.x, min.y, min.z,
            max.x, min.y, min.z,  max.x, min.y, max.z,
            max.x, min.y, max.z,  min.x, min.y, max.z,
            min.x, min.y, max.z,  min.x, min.y, min.z,
            
            // Top face
            min.x, max.y, min.z,  max.x, max.y, min.z,
            max.x, max.y, min.z,  max.x, max.y, max.z,
            max.x, max.y, max.z,  min.x, max.y, max.z,
            min.x, max.y, max.z,  min.x, max.y, min.z,
            
            // Vertical edges
            min.x, min.y, min.z,  min.x, max.y, min.z,
            max.x, min.y, min.z,  max.x, max.y, min.z,
            max.x, min.y, max.z,  max.x, max.y, max.z,
            min.x, min.y, max.z,  min.x, max.y, max.z,
        ]);

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        
        return geometry;
    }, [target]);

    // Update geometry when target changes
    useEffect(() => {
        if (lineRef.current && gridGeometry) {
            lineRef.current.geometry = gridGeometry;
        }
    }, [gridGeometry]);

    if (!gridGeometry || !visible) return null;

    return (
        <lineSegments ref={lineRef}>
            <bufferGeometry attach="geometry" {...gridGeometry} />
            <lineBasicMaterial attach="material" color={color} transparent opacity={0.8} />
        </lineSegments>
    );
}

// Hook for calculating bounding box
export function useBoundingBox(target: THREE.Object3D | null) {
    return useMemo(() => {
        if (!target) return null;
        
        const box = new THREE.Box3();
        box.setFromObject(target);
        
        if (box.isEmpty()) return null;
        
        return {
            min: box.min.clone(),
            max: box.max.clone(),
            center: box.getCenter(new THREE.Vector3()),
            size: box.getSize(new THREE.Vector3())
        };
    }, [target]);
}