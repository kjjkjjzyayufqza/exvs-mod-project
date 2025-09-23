// VDK Configuration Types

export type VdkType = 'SKY' | 'OBJECT' | 'EFFECT' | 'PROP';

export interface VdkConfig {
    // Core properties
    VDK_TYPE: VdkType;
    VDK_INITIAL_SPAWN?: boolean;
    VDK_POSITION_X?: number;
    VDK_POSITION_Y?: number;
    VDK_POSITION_Z?: number;
    VDK_ROTATION_X?: number;
    VDK_ROTATION_Y?: number;
    VDK_ROTATION_Z?: number;
    VDK_PLACEMENT_NAME?: string;
    VDK_OBJECTNUMBER?: number;
    VDK_PROGRAMID?: number;
    VDK_HITPOINT?: string;
    VDK_SHADOW_CAST?: boolean;
    
    // Effect-specific properties
    VDK_EFFECT_ID?: string;
    VDK_EFFECT_TIME_OFFSET?: number;
    VDK_SCALE_X?: number;
    VDK_SCALE_Y?: number;
    VDK_SCALE_Z?: number;
    VDK_SE_ID?: string;
    VDK_SE_TIME_OFFSET?: number;
    
    // Prop-specific properties
    VDK_PROP_RELEASE_ATTACH?: boolean;
    VDK_PROP_IMPULSE_EFFECT_WEAK_ID?: string;
    VDK_PROP_IMPULSE_EFFECT_STRONG_ID?: string;
    VDK_PROP_IMPULSE_EFFECT_RESTRAINT_RATIO?: number;
    VDK_PROP_IMPULSE_EFFECT_SCALE?: number;
    VDK_PROP_IMPULSE_EFFECT_STRENGTH?: number;
    VDK_PROP_DISAPPEAR_EFFECT_ID?: string;
    VDK_PROP_LIFE_MAX?: number;
    
    // Object enhancement properties
    VDK_BREAK_SHOCKWAVE_RADIUS?: number;
    VDK_BREAK_SHOCKWAVE_POWER?: number;
    VDK_SUBSTITUTE_PLACEMENT?: number | number[];
    VDK_CAMERA_BIND_PLACEMENT?: number | number[];
}

export interface VdkObjectInfo {
    objectNumber: number;
    programId: number;
    hitPoint: string;
    shadowCast: boolean;
    positions: [number, number, number][]; // Array of positions for multiple instances
    rotations: [number, number, number][]; // Array of rotations for multiple instances
    count: number; // Number of instances with same objectNumber
    
    // Object enhancement properties (arrays to support multiple instances)
    breakShockwaveRadius: number[];
    breakShockwavePower: number[];
    substitutePlacements: (number | number[])[]; // Each instance can have single or multiple substitute placements
    cameraBindPlacements: (number | number[])[]; // Each instance can have single or multiple camera bind placements
}
