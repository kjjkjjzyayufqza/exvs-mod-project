import { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface BoundingBoxGridProps {
    target: THREE.Object3D | null;
    visible?: boolean;
    color?: string;
}

export function BoundingBoxGrid({ target, visible = true, color = '#00ff00' }: BoundingBoxGridProps) {
    const lineRef = useRef<THREE.LineSegments>(null);
    const highlightRef = useRef<THREE.LineSegments>(null);
    
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
        if (highlightRef.current && gridGeometry) {
            highlightRef.current.geometry = gridGeometry;
        }
    }, [gridGeometry]);

    // Add pulsing animation effect
    useFrame((state) => {
        if (lineRef.current && highlightRef.current) {
            const time = state.clock.elapsedTime;
            const pulse = Math.sin(time * 4) * 0.3 + 0.7; // Pulsing between 0.4 and 1.0

            // Update main bounding box opacity
            const mainMaterial = lineRef.current.material as THREE.LineBasicMaterial;
            mainMaterial.opacity = 0.8 + pulse * 0.2;

            // Update highlight layer opacity
            const highlightMaterial = highlightRef.current.material as THREE.LineBasicMaterial;
            highlightMaterial.opacity = 0.4 + pulse * 0.2;
        }
    });

    if (!gridGeometry || !visible) return null;

    return (
        <>
            {/* Main bounding box with higher opacity */}
            <lineSegments ref={lineRef}>
                <bufferGeometry attach="geometry" {...gridGeometry} />
                <lineBasicMaterial attach="material" color={color} transparent opacity={1.0} linewidth={2} />
            </lineSegments>
            {/* Additional highlight layer for more visibility */}
            <lineSegments ref={highlightRef}>
                <bufferGeometry attach="geometry" {...gridGeometry} />
                <lineBasicMaterial attach="material" color="#ffffff" transparent opacity={1} linewidth={1} />
            </lineSegments>
        </>
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