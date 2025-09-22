// VDK Configuration Types

export type VdkType = 'SKY' | 'OBJECT';

export interface VdkConfig {
    VDK_TYPE: VdkType;
    VDK_INITIAL_SPAWN?: boolean;
    VDK_POSITION_X?: number | undefined;
    VDK_POSITION_Y?: number | undefined;
    VDK_POSITION_Z?: number | undefined;
    VDK_ROTATION_X?: number | undefined;
    VDK_ROTATION_Y?: number | undefined;
    VDK_ROTATION_Z?: number | undefined;
    VDK_PLACEMENT_NAME?: string;
    VDK_OBJECTNUMBER?: number | undefined;
    VDK_PROGRAMID?: number | undefined;
    VDK_HITPOINT?: string;
    VDK_SHADOW_CAST?: boolean;
}

export interface VdkObjectInfo {
    objectNumber: number;
    programId: number;
    hitPoint: string;
    shadowCast: boolean;
    positions: [number, number, number][]; // Array of positions for multiple instances
    rotations: [number, number, number][]; // Array of rotations for multiple instances
    count: number; // Number of instances with same objectNumber
}
