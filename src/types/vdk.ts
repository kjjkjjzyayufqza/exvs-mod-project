// VDK Configuration Types

export type VdkType = 'SKY' | 'OBJECT';

export interface VdkConfig {
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
}

export interface VdkObjectInfo {
    objectNumber: number;
    programId: number;
    hitPoint: string;
    shadowCast: boolean;
    position: [number, number, number];
    rotation: [number, number, number];
    count: number; // Number of instances with same objectNumber
}
